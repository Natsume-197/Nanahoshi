export function resolveUploadTargetPathId(
	paths: readonly { id: number }[],
	selectedPathId: number | null,
): number | null {
	if (paths.some((path) => path.id === selectedPathId)) return selectedPathId;
	return paths[0]?.id ?? null;
}

export function hasEnabledLibraryPath(library: {
	paths?: { isEnabled?: boolean | null }[] | null;
}): boolean {
	return (library.paths ?? []).some((path) => path.isEnabled !== false);
}

/**
 * The libraries an upload can actually land in: audiobook libraries have no
 * upload path at all, and a books library with no enabled folder has nowhere to
 * write. Offering either would only fail at submit time.
 */
export function getUploadableLibraries<
	T extends {
		mediaType: string;
		paths?: { id: number; isEnabled?: boolean | null }[] | null;
	},
>(libraries: readonly T[]): T[] {
	return libraries.filter(
		(library) =>
			library.mediaType !== "audiobook" && hasEnabledLibraryPath(library),
	);
}

export function resolveUploadTargetLibrary<
	T extends {
		id: number;
		paths?: { id: number; isEnabled?: boolean | null }[] | null;
	},
>(libraries: readonly T[], selectedLibraryId: number | null): T | null {
	const selected = libraries.find(
		(library) => library.id === selectedLibraryId,
	);
	if (selected) return selected;
	const withFolder = libraries.find(hasEnabledLibraryPath);
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
