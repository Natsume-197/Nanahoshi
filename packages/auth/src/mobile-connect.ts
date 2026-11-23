import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import {
	PAIRED_TTL_MS,
	PAIRING_TTL_MS,
	pairedIdentifier,
	pairingIdentifier,
	pairingStatus,
} from "./mobile-connect.rules";

async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Buffer.from(digest).toString("base64url");
}

const tokenSchema = z.object({ token: z.string().min(16).max(128) });

/**
 * "Connect a phone": a signed-in browser makes a short-lived, single-use code
 * (shown as a QR); the phone trades it for a session of its own, so signing
 * out on one device never signs out the other. Only a hash is stored.
 */
export const mobileConnect = () =>
	({
		id: "mobile-connect",
		endpoints: {
			createMobileConnect: createAuthEndpoint(
				"/mobile-connect/create",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const token = generateRandomString(32);
					const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: pairingIdentifier(await hashToken(token)),
						value: ctx.context.session.user.id,
						expiresAt,
					});
					return ctx.json({ token, expiresAt: expiresAt.toISOString() });
				},
			),
			mobileConnectStatus: createAuthEndpoint(
				"/mobile-connect/status",
				{ method: "POST", use: [sessionMiddleware], body: tokenSchema },
				async (ctx) => {
					const hash = await hashToken(ctx.body.token);
					const adapter = ctx.context.internalAdapter;
					const [pending, paired] = await Promise.all([
						adapter.findVerificationValue(pairingIdentifier(hash)),
						adapter.findVerificationValue(pairedIdentifier(hash)),
					]);
					const userId = ctx.context.session.user.id;
					return ctx.json(
						pairingStatus({
							pending: pending?.value === userId ? pending : null,
							paired: paired?.value.startsWith(`${userId}:`) ? paired : null,
							now: new Date(),
						}),
					);
				},
			),
			redeemMobileConnect: createAuthEndpoint(
				"/mobile-connect/redeem",
				{ method: "POST", body: tokenSchema },
				async (ctx) => {
					const hash = await hashToken(ctx.body.token);
					const adapter = ctx.context.internalAdapter;
					const pairing = await adapter.consumeVerificationValue(
						pairingIdentifier(hash),
					);
					if (!pairing || pairing.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", { message: "PAIRING_EXPIRED" });
					}
					const user = await adapter.findUserById(pairing.value);
					if (!user || (user as { banned?: boolean | null }).banned) {
						throw new APIError("FORBIDDEN", { message: "PAIRING_REFUSED" });
					}
					const session = await adapter.createSession(user.id);
					await setSessionCookie(ctx, { session, user });
					await adapter.createVerificationValue({
						identifier: pairedIdentifier(hash),
						value: `${user.id}:${session.id}`,
						expiresAt: new Date(Date.now() + PAIRED_TTL_MS),
					});
					return ctx.json({ user: { id: user.id, name: user.name } });
				},
			),
		},
	}) satisfies BetterAuthPlugin;
