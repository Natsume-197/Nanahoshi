/** Pages that rise over the stack as a card instead of sliding in. */
export const CARD_ROUTES: ReadonlySet<string> = new Set([
	"book/[uuid]",
	"audiobook/[uuid]",
]);

/**
 * Whether the screen `key` is going behind a card: something now sits above
 * it and the top of the stack is a card page. A screen leaving because it was
 * popped is never above the top, so it never sinks.
 */
export function isCoveredByCard(
	routes: readonly { key: string; name: string }[],
	key: string,
): boolean {
	const index = routes.findIndex((route) => route.key === key);
	const top = routes[routes.length - 1];
	return index >= 0 && index < routes.length - 1 && CARD_ROUTES.has(top.name);
}
