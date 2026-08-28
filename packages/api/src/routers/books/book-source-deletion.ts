import fs from "node:fs/promises";
import path from "node:path";

export class UnsafeBookSourceError extends Error {}

function isMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isInsideRoot(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative.length > 0 &&
		!relative.startsWith(`..${path.sep}`) &&
		relative !== ".." &&
		!path.isAbsolute(relative)
	);
}

async function validateSourcePath(
	libraryRoot: string,
	sourcePath: string,
): Promise<{ path: string; exists: boolean }> {
	const lexicalRoot = path.resolve(libraryRoot);
	const lexicalSource = path.resolve(sourcePath);
	if (!isInsideRoot(lexicalRoot, lexicalSource)) {
		throw new UnsafeBookSourceError(
			"The book source is outside its library folder",
		);
	}

	let realRoot: string;
	try {
		realRoot = await fs.realpath(lexicalRoot);
	} catch {
		throw new UnsafeBookSourceError("The library folder is not available");
	}

	let stat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stat = await fs.lstat(lexicalSource);
	} catch (error) {
		if (isMissing(error)) return { path: lexicalSource, exists: false };
		throw error;
	}

	if (stat.isSymbolicLink() || !stat.isFile()) {
		throw new UnsafeBookSourceError("The book source is not a regular file");
	}

	const realSource = await fs.realpath(lexicalSource);
	if (!isInsideRoot(realRoot, realSource)) {
		throw new UnsafeBookSourceError(
			"The book source is outside its library folder",
		);
	}

	return { path: lexicalSource, exists: true };
}

async function removeEmptyParentDirectories(
	deletedPaths: string[],
	libraryRoot: string,
): Promise<void> {
	const root = path.resolve(libraryRoot);
	const directories = new Set<string>();
	for (const deletedPath of deletedPaths) {
		let directory = path.dirname(deletedPath);
		while (isInsideRoot(root, directory)) {
			directories.add(directory);
			directory = path.dirname(directory);
		}
	}

	for (const directory of [...directories].sort(
		(a, b) => b.length - a.length,
	)) {
		try {
			await fs.rmdir(directory);
		} catch {
			// Directory pruning is best-effort. The owned source files are already
			// gone, and a sidecar or a permissions boundary must not block catalog
			// cleanup after that irreversible step.
		}
	}
}

export async function deleteBookSource(input: {
	libraryRoot: string;
	sourcePaths: string[];
	pruneEmptyDirectories: boolean;
}): Promise<{
	deletedPaths: string[];
	sourceWasMissing: boolean;
}> {
	const uniquePaths = [
		...new Set(input.sourcePaths.map((sourcePath) => path.resolve(sourcePath))),
	];
	const validated = await Promise.all(
		uniquePaths.map((sourcePath) =>
			validateSourcePath(input.libraryRoot, sourcePath),
		),
	);

	const deletedPaths: string[] = [];
	let sourceWasMissing = false;
	for (const target of validated) {
		if (!target.exists) {
			sourceWasMissing = true;
			continue;
		}
		await fs.unlink(target.path);
		deletedPaths.push(target.path);
	}

	if (input.pruneEmptyDirectories) {
		await removeEmptyParentDirectories(deletedPaths, input.libraryRoot);
	}

	return { deletedPaths, sourceWasMissing };
}
