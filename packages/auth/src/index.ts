import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import nodemailer from "nodemailer";
import {
	ac,
	admin as adminRole,
	member as memberRole,
	owner as ownerRole,
} from "./permissions";

const isProd = env.ENVIRONMENT === "production";

const crossSubDomainCookies =
	isProd && env.COOKIE_DOMAIN
		? { enabled: true, domain: env.COOKIE_DOMAIN }
		: { enabled: false };

const cookieConfig = {
	sameSite: (isProd ? "none" : "lax") as "none" | "lax",
	secure: true,
	httpOnly: true,
};

function buildInvitationEmail({
	email,
	inviterName,
	inviterEmail,
	organizationName,
	inviteLink,
}: {
	email: string;
	inviterName: string;
	inviterEmail: string;
	organizationName: string;
	inviteLink: string;
}): string {
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

const authConfig = {
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: true,
	},
	advanced: {
		defaultCookieAttributes: cookieConfig,
		crossSubDomainCookies: crossSubDomainCookies,
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
			invitationExpiresIn: 60 * 60 * 48, // 48 hours in seconds
			allowUserToCreateOrganization: false,
			async sendInvitationEmail(data) {
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
	],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authConfig) as ReturnType<
	typeof betterAuth<typeof authConfig>
>;
