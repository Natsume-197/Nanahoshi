/** The audiobook that was loaded when the app last closed, per server: the
 * web's `audio-active-book`, so reopening brings the mini player back. */
export function encodeActiveBook(serverUrl: string, uuid: string): string {
	return JSON.stringify({ serverUrl, uuid });
}

export function decodeActiveBook(
	raw: string | null,
	serverUrl: string,
): string | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as { serverUrl?: unknown; uuid?: unknown };
		return value.serverUrl === serverUrl && typeof value.uuid === "string"
			? value.uuid
			: null;
	} catch {
		return null;
	}
}
