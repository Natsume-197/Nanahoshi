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
}: {
	canCreateLibrary: boolean;
	canUpload: boolean;
	libraryCount: number;
	titleCount: number;
}): SetupStep[] | null {
	if (titleCount > 0) return null;
	const steps: SetupStep[] = [];
	if (canCreateLibrary) steps.push({ id: "library", done: libraryCount > 0 });
	if (canUpload) steps.push({ id: "upload", done: false });
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
