export function normalizePath(input: string): string {
	const segments = input.replaceAll("\\", "/").split("/");
	const output: string[] = [];
	for (const segment of segments) {
		if (!segment || segment === ".") continue;
		if (segment === "..") output.pop();
		else output.push(segment);
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
