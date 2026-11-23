/** A pairing code lives this long; the QR shows a countdown to it. */
export const PAIRING_TTL_MS = 5 * 60 * 1000;
/** How long the browser can still learn that the phone got in. */
export const PAIRED_TTL_MS = 10 * 60 * 1000;

export const pairingIdentifier = (hash: string) => `mobile-connect:${hash}`;
export const pairedIdentifier = (hash: string) => `mobile-connect-done:${hash}`;

export type PairingStatus = "pending" | "paired" | "expired";

type Stored = { expiresAt: Date } | null;

/** What the browser showing the QR should say: still waiting, the phone is
 * in, or the code ran out unused. */
export function pairingStatus({
	pending,
	paired,
	now,
}: {
	pending: Stored;
	paired: Stored;
	now: Date;
}): { status: PairingStatus } {
	if (paired && paired.expiresAt > now) return { status: "paired" };
	if (pending && pending.expiresAt > now) return { status: "pending" };
	return { status: "expired" };
}
