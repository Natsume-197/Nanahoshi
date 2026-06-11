/**
 * Minimal posix-style path helpers for resolving hrefs inside EPUB archives
 * (replaces the `path-browserify` dependency used by the original ttu code).
 */

export function normalizePath(input: string): string {
	const segments = input.split("/");
	const output: string[] = [];

	for (const segment of segments) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			output.pop();
		} else {
			output.push(segment);
		}
	}

	return output.join("/");
}

export function joinPath(...parts: string[]): string {
	return normalizePath(parts.filter(Boolean).join("/"));
}

export function dirname(input: string): string {
	const normalized = normalizePath(input);
	const index = normalized.lastIndexOf("/");
	return index === -1 ? "." : normalized.slice(0, index) || ".";
}

export function basename(input: string): string {
	const normalized = normalizePath(input);
	const index = normalized.lastIndexOf("/");
	return index === -1 ? normalized : normalized.slice(index + 1);
}
