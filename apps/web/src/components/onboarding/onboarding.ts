/** The server's id from its name; the admin never sees or types it. Names with
 * no Latin letters (七星文庫) still get one. */
export function serverSlug(name: string, random = Math.random): string {
	const slug = name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return slug || `server-${random().toString(36).slice(2, 8)}`;
}

/** A username the username plugin accepts ([a-z0-9_.], 3–30), from the email
 * typed just above it, until the admin edits it. */
export function usernameFromEmail(email: string): string {
	const base = (email.split("@")[0] ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9_.]/g, "")
		.slice(0, 30);
	return base.length >= 3 ? base : "";
}

export type FolderCounts = { ebooks: number; audiobooks: number };
export type LibraryKind = "ebook" | "audiobook";

/** Which libraries a folder becomes: whatever it holds, both if both, and a
 * books library when it's still empty (uploads land there). */
export function librariesFor(counts: FolderCounts | undefined): LibraryKind[] {
	if (!counts) return ["ebook"];
	const kinds: LibraryKind[] = [];
	if (counts.ebooks > 0) kinds.push("ebook");
	if (counts.audiobooks > 0) kinds.push("audiobook");
	return kinds.length > 0 ? kinds : ["ebook"];
}

export type WelcomeStage = "books" | "importing" | "ready" | "empty";

/** Where the welcome flow stands, from what the server has: reloading or
 * coming back later lands on the same step. */
export function welcomeStage({
	libraryCount,
	bookCount,
	importing,
}: {
	libraryCount: number;
	bookCount: number;
	importing: boolean;
}): WelcomeStage {
	if (libraryCount === 0) return "books";
	if (importing) return "importing";
	return bookCount > 0 ? "ready" : "empty";
}
