import { apiKey } from "@better-auth/api-key";
import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
	admin,
	genericOAuth,
	organization,
	username,
} from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { provisionOidcUser } from "./oidc-provisioning";
import {
	ac,
	admin as adminRole,
	member as memberRole,
	owner as ownerRole,
} from "./permissions";
import { checkSignUp } from "./signup-gate";
import type { SignUpDenialReason } from "./signup-gate.rules";

const isProd = env.ENVIRONMENT === "production";

/**
 * Carries an invite-link code across the OAuth round-trip: set when the client
 * starts a social sign-in with an `x-invite-code` header, read back by the
 * sign-up gate when the provider callback creates the user. Short-lived and
 * validated against the database on every read, so it needs no signing.
 */
const INVITE_CODE_COOKIE = "nanahoshi_invite_code";
const INVITE_CODE_PATTERN = /^[\w-]{1,64}$/;

/**
 * OAuth callback failures reach the client as a redirect with
 * `?error=<message with underscores>` — the human-readable message is lost.
 * Throw short stable codes instead; the web app translates them.
 */
const OAUTH_DENIAL_CODES: Record<SignUpDenialReason, string> = {
	closed: "signup_closed",
	method_disabled: "signup_method_disabled",
	invite_required: "invite_required",
};

const EMAIL_DENIAL_MESSAGES: Record<SignUpDenialReason, string> = {
	closed: "This server is not accepting new accounts.",
	method_disabled: "Email sign-up is disabled on this server.",
	invite_required:
		"Sign-ups on this server require an invitation. Ask an administrator for an invite link.",
};

const crossSubDomainCookies =
	isProd && env.COOKIE_DOMAIN
		? { enabled: true, domain: env.COOKIE_DOMAIN }
		: { enabled: false };

const cookieConfig = {
	sameSite: (isProd ? "none" : "lax") as "none" | "lax",
	secure: true,
	httpOnly: true,
};

/** Escape user-controlled values before interpolating into the invitation HTML. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function buildInvitationEmail(raw: {
	email: string;
	inviterName: string;
	inviterEmail: string;
	organizationName: string;
	inviteLink: string;
}): string {
	const email = escapeHtml(raw.email);
	const inviterName = escapeHtml(raw.inviterName);
	const inviterEmail = escapeHtml(raw.inviterEmail);
	const organizationName = escapeHtml(raw.organizationName);
	// inviteLink is app-constructed (CORS_ORIGIN + token); escape defensively too.
	const inviteLink = escapeHtml(raw.inviteLink);
	return `<!DOCTYPE html>
<html lang="en">
<body style="font-family: sans-serif; background: #f9f9f9; padding: 40px; margin: 0;">
  <table align="center" width="600" style="background: white; border-radius: 8px; padding: 40px; border: 1px solid #e5e7eb;">
    <tr>
      <td>
        <h1 style="margin-top: 0; color: #111827;">You're invited!</h1>
        <p style="color: #374151;">
          <strong>${inviterName}</strong> (${inviterEmail}) has invited you to join
          <strong>${organizationName}</strong>.
        </p>
        <p>
          <a href="${inviteLink}"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          If the button above doesn't work, copy this link into your browser:<br />
          <a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <small style="color: #9ca3af;">This invitation was sent to ${email}</small>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The org a new session should activate: the user's last active org if they're
 *  still a member, otherwise their first membership (null if they belong to none). */
async function resolveActiveOrgId(userId: string): Promise<string | null> {
	const [userRow] = await db
		.select({ lastActiveOrganizationId: schema.user.lastActiveOrganizationId })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.limit(1);

	const lastId = userRow?.lastActiveOrganizationId;
	if (lastId) {
		const [stillMember] = await db
			.select({ id: schema.member.id })
			.from(schema.member)
			.where(
				and(
					eq(schema.member.userId, userId),
					eq(schema.member.organizationId, lastId),
				),
			)
			.limit(1);
		if (stillMember) return lastId;
	}

	const [first] = await db
		.select({ organizationId: schema.member.organizationId })
		.from(schema.member)
		.where(eq(schema.member.userId, userId))
		.limit(1);
	return first?.organizationId ?? null;
}

const authConfig = {
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: true,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
	// Brute-force / credential-stuffing protection. Default in-memory storage is
	// fine for a single instance; multi-instance deploys should point this at the
	// existing Redis via `secondaryStorage`.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-up/email": { window: 60, max: 5 },
			"/forget-password": { window: 60, max: 3 },
			"/reset-password": { window: 60, max: 5 },
			// Authenticated read GETs the client polls on every navigation (also on
			// the SW allowlist). Brute-force protection is irrelevant here, so they
			// get their own generous budget instead of sharing the global 100/60
			// with each other and triggering spurious 429s during normal browsing.
			"/get-session": { window: 60, max: 1000 },
			"/organization/list": { window: 60, max: 1000 },
			"/organization/get-full-organization": { window: 60, max: 1000 },
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			// Required for explicit linkSocial: local accounts are never
			// emailVerified (no verification flow), and better-auth demands
			// trusted-provider OR verified email to start a link.
			trustedProviders: ["discord"],
			// Never link silently on same-email Discord sign-in: Discord allows
			// unverified emails, and trustedProviders skips the verified check, so
			// implicit linking would let anyone squat an email and take over the
			// account. Linking only from an authenticated session (settings/invite).
			disableImplicitLinking: true,
			// Discord here is an access-check identity, not the login identity:
			// explicit "Link Discord" from settings/invite must work even when the
			// Discord email differs from the account email.
			allowDifferentEmails: true,
		},
	},
	user: {
		additionalFields: {
			lastActiveOrganizationId: {
				type: "string" as const,
				required: false,
				defaultValue: null,
				input: false, // not exposed in sign-up/update-user client forms
			},
		},
	},
	advanced: {
		defaultCookieAttributes: cookieConfig,
		crossSubDomainCookies: crossSubDomainCookies,
	},
	databaseHooks: {
		// Social/OAuth callbacks create users without passing through the
		// /sign-up/email gate above. Gate them here: after first setup, a new
		// Discord user needs a pending email invitation or the invite-link code
		// stashed in a cookie when the sign-in started. OIDC (/oauth2/callback)
		// is exempt — SSO provisioning is configured intentionally by the admin.
		user: {
			create: {
				before: async (user, context) => {
					const path = context?.path;
					if (!path?.startsWith("/callback")) return;
					const inviteCode = context?.getCookie?.(INVITE_CODE_COOKIE) ?? null;
					const verdict = await checkSignUp({
						email: user.email,
						inviteCode,
						method: "discord",
					});
					if (verdict.allowed) return;
					throw new APIError("FORBIDDEN", {
						message: OAUTH_DENIAL_CODES[verdict.reason],
					});
				},
			},
		},
		session: {
			create: {
				// Activate the user's last/first org as the session is created, so the
				// very first getSession already returns it (no cookie-cache race).
				before: async (session) => {
					if (session.activeOrganizationId) return;
					const activeOrganizationId = await resolveActiveOrgId(session.userId);
					if (!activeOrganizationId) return;
					return { data: { ...session, activeOrganizationId } };
				},
			},
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			// Email invitations need SMTP. Fail the request here — sendInvitationEmail
			// runs as a background task, so throwing there still returns 200 and the
			// UI would report success for an email that was never sent.
			if (ctx.path === "/organization/invite-member") {
				if (!env.SMTP_USER || !env.SMTP_PASS) {
					throw new APIError("BAD_REQUEST", {
						message:
							"Email is not configured on this server. Create an invite link instead, or set the SMTP_USER and SMTP_PASS environment variables.",
					});
				}
				return;
			}
			// A social sign-in that started from an invite page carries the code as
			// a header; stash it in a short-lived cookie so the OAuth callback's
			// sign-up gate can see it after the round-trip through the provider.
			if (ctx.path === "/sign-in/social") {
				const code = ctx.headers?.get("x-invite-code");
				if (code && INVITE_CODE_PATTERN.test(code)) {
					ctx.setCookie(INVITE_CODE_COOKIE, code, {
						path: "/",
						httpOnly: true,
						secure: true,
						// The callback arrives as a top-level redirect GET, which Lax allows.
						sameSite: "lax",
						maxAge: 600,
					});
				}
				return;
			}
			// Sign-up is open only until first setup; afterwards the instance
			// registration policy decides, with an invite link code (sent by the
			// client as a header) or a pending email invitation.
			if (ctx.path !== "/sign-up/email") return;
			const email =
				typeof ctx.body?.email === "string" ? ctx.body.email : undefined;
			const inviteCode = ctx.headers?.get("x-invite-code");
			const verdict = await checkSignUp({ email, inviteCode, method: "email" });
			if (verdict.allowed) return;
			throw new APIError("FORBIDDEN", {
				message: EMAIL_DENIAL_MESSAGES[verdict.reason],
			});
		}),
		after: createAuthMiddleware(async (ctx) => {
			// OIDC provisions the membership here — after the session row exists — so
			// session.create.before couldn't see it. Provision, then set the active
			// org now. Non-OIDC sign-ins are already handled by session.create.before.
			if (!ctx.path.startsWith("/oauth2/callback")) return;
			const newSession = ctx.context.newSession;
			if (!newSession?.session?.id || !newSession?.user?.id) return;

			await provisionOidcUser(newSession.user.id).catch((err) => {
				console.warn("[OIDC] provisioning failed:", err);
			});

			if (newSession.session.activeOrganizationId) return;
			const targetOrgId = await resolveActiveOrgId(newSession.user.id);
			if (!targetOrgId) return;
			await db
				.update(schema.session)
				.set({ activeOrganizationId: targetOrgId })
				.where(eq(schema.session.id, newSession.session.id));
		}),
	},
	...(env.DISCORD_CLIENT_ID &&
		env.DISCORD_CLIENT_SECRET && {
			socialProviders: {
				discord: {
					clientId: env.DISCORD_CLIENT_ID,
					clientSecret: env.DISCORD_CLIENT_SECRET,
					scope: ["identify", "email", "guilds", "guilds.members.read"],
				},
			},
		}),
	plugins: [
		organization({
			ac,
			roles: {
				owner: ownerRole,
				admin: adminRole,
				member: memberRole,
			},
			// Better Auth defaults to 100 members per organization. Nanahoshi is
			// self-hosted and some servers legitimately exceed that, so membership
			// capacity belongs to the deployment/database rather than an implicit
			// authentication-library limit.
			membershipLimit: Number.MAX_SAFE_INTEGER,
			invitationExpiresIn: 60 * 60 * 48, // 48 hours in seconds
			allowUserToCreateOrganization: false,
			async sendInvitationEmail(data) {
				if (!env.SMTP_USER || !env.SMTP_PASS) {
					throw new APIError("BAD_REQUEST", {
						message:
							"Email is not configured on this server. Create an invite link instead, or set the SMTP_USER and SMTP_PASS environment variables.",
					});
				}
				const transporter = nodemailer.createTransport({
					host: env.SMTP_HOST,
					port: Number(env.SMTP_PORT),
					secure: env.SMTP_SECURE === true,
					auth: {
						user: env.SMTP_USER,
						pass: env.SMTP_PASS,
					},
				});

				const inviteLink = `${env.CORS_ORIGIN}/dashboard/invitations?token=${data.invitation.id}`;

				await transporter.sendMail({
					from: `"Nanahoshi" <${env.SMTP_USER}>`,
					to: data.email,
					subject: `You've been invited to join ${data.organization.name}`,
					html: buildInvitationEmail({
						email: data.email,
						inviterName: data.inviter.user.name,
						inviterEmail: data.inviter.user.email,
						organizationName: data.organization.name,
						inviteLink,
					}),
				});
			},
		}),
		admin(),
		username(),
		apiKey({
			defaultPrefix: "nana",
			enableMetadata: true,
			defaultKeyLength: 16,
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60,
				maxRequests: 60,
			},
		}),
		...(env.OIDC_ENABLED && env.OIDC_ISSUER && env.OIDC_CLIENT_ID
			? [
					genericOAuth({
						config: [
							{
								providerId: env.OIDC_PROVIDER_ID,
								discoveryUrl: `${env.OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
								clientId: env.OIDC_CLIENT_ID,
								clientSecret: env.OIDC_CLIENT_SECRET ?? "",
								scopes: env.OIDC_SCOPES.split(/\s+/).filter(Boolean),
								pkce: true,
								// The username plugin makes user.username NOT NULL + unique and
								// only allows [a-zA-Z0-9_.] (3–30). OIDC profiles have no
								// username, so derive a valid one, suffixed with the (unique)
								// sub to avoid collisions.
								mapProfileToUser: (profile) => {
									const email =
										typeof profile.email === "string"
											? profile.email
											: undefined;
									const sub = String(profile.sub ?? "");
									const base =
										(email?.split("@")[0] ?? sub)
											.toLowerCase()
											.replace(/[^a-z0-9_.]/g, "")
											.slice(0, 20) || "user";
									const suffix = sub.replace(/[^a-z0-9]/gi, "").slice(-6);
									const name =
										typeof profile.name === "string" ? profile.name : email;
									return {
										email,
										name,
										username: suffix ? `${base}_${suffix}` : base,
										displayUsername: name,
									};
								},
							},
						],
					}),
				]
			: []),
	],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authConfig) as ReturnType<
	typeof betterAuth<typeof authConfig>
>;
