export function resolveUploadTargetPathId(
	paths: readonly { id: number }[],
	selectedPathId: number | null,
): number | null {
	if (paths.some((path) => path.id === selectedPathId)) return selectedPathId;
	return paths[0]?.id ?? null;
}

/** Audiobook libraries have no upload path, so they never accept uploads. */
export function getUploadableLibraries<T extends { mediaType: string }>(
	libraries: readonly T[],
): T[] {
	return libraries.filter((library) => library.mediaType !== "audiobook");
}

export function resolveUploadTargetLibrary<
	T extends { id: number; paths?: { isEnabled?: boolean | null }[] | null },
>(libraries: readonly T[], selectedLibraryId: number | null): T | null {
	const selected = libraries.find(
		(library) => library.id === selectedLibraryId,
	);
	if (selected) return selected;
	const withFolder = libraries.find((library) =>
		(library.paths ?? []).some((path) => path.isEnabled !== false),
	);
	return withFolder ?? libraries[0] ?? null;
}

export function getActiveProviderPositions(
	providers: readonly { id: string; enabled: boolean }[],
): Map<string, number> {
	return new Map(
		providers
			.filter((provider) => provider.enabled)
			.map((provider, index) => [provider.id, index + 1]),
	);
}

export function permissionMapsEqual(
	a: Record<string, string[]>,
	b: Record<string, string[]>,
): boolean {
	const normalize = (map: Record<string, string[]>) =>
		Object.fromEntries(
			Object.entries(map)
				.filter(([, actions]) => actions.length > 0)
				.sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
				.map(([resource, actions]) => [resource, [...actions].sort()]),
		);
	return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
