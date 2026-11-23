/** The web's CreateServerDialog slug: lowercase ASCII words joined by "-". */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/** Names with no Latin letters (日本語, Ελληνικά) slugify to nothing, and the
 * slug is required; fall back to a short random one instead of blocking. */
export function slugOrFallback(name: string, random = Math.random): string {
	return slugify(name) || `server-${random().toString(36).slice(2, 8)}`;
}

// The web home's import task types: a first scan or upload filling the server.
const IMPORT_TASK_TYPES: ReadonlySet<string> = new Set([
	"library-scan",
	"library-upload",
	"library-reprocess",
	"library-regroup",
]);

export function isImporting(
	tasks: { type: string; status: string }[] | undefined,
): boolean {
	return (tasks ?? []).some(
		(task) => task.status === "running" && IMPORT_TASK_TYPES.has(task.type),
	);
}

export type SetupStepId = "library" | "upload";
export type SetupStep = { id: SetupStepId; done: boolean };

/**
 * The Home "Let's get set up" checklist: only the steps this person can take,
 * each ticked from what the server already has. Null once there's nothing
 * left to guide (or nothing they're allowed to do).
 */
export function setupSteps({
	canCreateLibrary,
	canUpload,
	libraryCount,
	titleCount,
	importing,
}: {
	canCreateLibrary: boolean;
	canUpload: boolean;
	libraryCount: number;
	titleCount: number;
	/** Books are on their way (a scan or upload runs) but none are listed yet. */
	importing: boolean;
}): SetupStep[] | null {
	if (titleCount > 0) return null;
	const steps: SetupStep[] = [];
	if (canCreateLibrary) steps.push({ id: "library", done: libraryCount > 0 });
	if (canUpload) steps.push({ id: "upload", done: importing });
	return steps.length > 0 ? steps : null;
}

/** "/a/b/c" → ["/", "/a", "/a/b", "/a/b/c"], for the folder breadcrumbs. */
export function pathCrumbs(path: string): { name: string; path: string }[] {
	const parts = path.split("/").filter(Boolean);
	const crumbs = [{ name: "/", path: "/" }];
	let current = "";
	for (const part of parts) {
		current += `/${part}`;
		crumbs.push({ name: part, path: current });
	}
	return crumbs;
}

export function parentPath(path: string): string {
	const parts = path.split("/").filter(Boolean);
	parts.pop();
	return `/${parts.join("/")}`;
}

export type FolderCounts = { ebooks: number; audiobooks: number };
export type LibraryKind = "ebook" | "audiobook";

/** Which libraries a folder becomes (as on the web): whatever it holds, both
 * if both, and a books library while it's still empty. */
export function librariesFor(counts: FolderCounts | undefined): LibraryKind[] {
	if (!counts) return ["ebook"];
	const kinds: LibraryKind[] = [];
	if (counts.ebooks > 0) kinds.push("ebook");
	if (counts.audiobooks > 0) kinds.push("audiobook");
	return kinds.length > 0 ? kinds : ["ebook"];
}

export type BooksStage = "choose" | "importing" | "ready" | "empty";

/** Where the first-books flow stands, from what the server has, so closing
 * and reopening it lands in the same place. */
export function booksStage({
	libraryCount,
	bookCount,
	importing,
}: {
	libraryCount: number;
	bookCount: number;
	importing: boolean;
}): BooksStage {
	if (libraryCount === 0) return "choose";
	if (importing) return "importing";
	return bookCount > 0 ? "ready" : "empty";
}

/** A username the server accepts ([a-z0-9_.], 3–30), from the email typed
 * above it, until it's edited by hand. */
export function usernameFromEmail(email: string): string {
	const base = (email.split("@")[0] ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9_.]/g, "")
		.slice(0, 30);
	return base.length >= 3 ? base : "";
}
