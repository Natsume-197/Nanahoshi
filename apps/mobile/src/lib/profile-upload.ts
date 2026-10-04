import type { NanahoshiAuth } from "./auth-client";

export type ImageSlot = "avatar" | "header";

export const UPLOAD_LIMIT_MB: Record<ImageSlot, number> = {
	avatar: 5,
	header: 10,
};

/** Sends a picked file to the same endpoint the web uses and returns the
 * stored image's URL. The cookie travels by hand: React Native keeps none. */
export async function uploadProfileImage({
	serverUrl,
	auth,
	slot,
	file,
}: {
	serverUrl: string;
	auth: NanahoshiAuth;
	slot: ImageSlot;
	file: { uri: string; name: string; type: string };
}): Promise<string> {
	const body = new FormData();
	// React Native's FormData streams a local file from its uri.
	body.append("file", file as unknown as Blob);
	const cookie = await auth.getCookie();
	const response = await fetch(`${serverUrl}/api/profile/${slot}`, {
		method: "POST",
		body,
		headers: cookie ? { cookie } : undefined,
	});
	const result = (await response.json().catch(() => null)) as {
		imageUrl?: string;
		message?: string;
	} | null;
	if (!response.ok || !result?.imageUrl) {
		throw new Error(result?.message ?? "upload failed");
	}
	return result.imageUrl;
}

/** The server keeps every upload until told the old one was replaced. */
export async function cleanUpReplacedImage({
	serverUrl,
	auth,
	slot,
	oldUrl,
}: {
	serverUrl: string;
	auth: NanahoshiAuth;
	slot: ImageSlot;
	oldUrl: string;
}) {
	const cookie = await auth.getCookie();
	await fetch(`${serverUrl}/api/media/cleanup`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify({ kind: slot, oldUrl }),
	}).catch(() => undefined);
}
