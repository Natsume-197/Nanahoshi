import type { MediaKind } from "./routes";

export type SeedPerson = { uuid: string; name: string };

/** What the tapped tile or row already showed, so the detail page can draw
 * its hero before the server answers. */
export type TitleSeed = {
	title: string | null;
	cover: string | null;
	color: string | null;
	authors: SeedPerson[];
};

type PersonLike = { uuid?: string | null; name?: string | null };

/** List rows carry authors in a few shapes; only complete ones can link. */
export function seedPeople(
	people: readonly PersonLike[] | null | undefined,
): SeedPerson[] {
	const list = people ?? [];
	const complete = list.filter(
		(person): person is SeedPerson => !!person.uuid && !!person.name?.trim(),
	);
	// A partial list would read as the full byline and then grow.
	return complete.length === list.length
		? complete.map(({ uuid, name }) => ({ uuid, name }))
		: [];
}

/** Sorted, so a seed's authors and the detail's share one query key. */
export const authorKey = (people: readonly { uuid: string }[]) =>
	people.map((person) => person.uuid).sort();

const MAX_SEEDS = 64;
const seeds = new Map<string, TitleSeed>();
const key = (kind: MediaKind, uuid: string) => `${kind}:${uuid}`;

export function rememberSeed(kind: MediaKind, uuid: string, seed: TitleSeed) {
	const id = key(kind, uuid);
	seeds.delete(id);
	seeds.set(id, seed);
	if (seeds.size > MAX_SEEDS) {
		const oldest = seeds.keys().next().value;
		if (oldest !== undefined) seeds.delete(oldest);
	}
}

export function titleSeed(kind: MediaKind, uuid: string): TitleSeed | null {
	return seeds.get(key(kind, uuid)) ?? null;
}

export function forgetSeeds() {
	seeds.clear();
}
