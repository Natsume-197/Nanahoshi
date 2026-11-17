/**
 * `list` in the order its ids were first seen; ids that arrive later go at
 * the end. A list the server re-sorts after every change (collections by last
 * update) then holds still under the finger that is changing it.
 */
export function inSeenOrder<T extends { id: string }>(
	list: T[],
	seen: readonly string[],
): T[] {
	const rank = new Map(seen.map((id, index) => [id, index]));
	return list
		.map((item, index) => ({ item, index }))
		.sort(
			(a, b) =>
				(rank.get(a.item.id) ?? seen.length + a.index) -
				(rank.get(b.item.id) ?? seen.length + b.index),
		)
		.map(({ item }) => item);
}
