/**
 * A tiny external store for "which day is hovered". The diary writes it and only
 * the chart subscribes, so hovering rows never re-renders the whole history tab.
 */
export function createDayStore() {
	let value: string | undefined;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next: string | undefined) => {
			if (next === value) return;
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type DayStore = ReturnType<typeof createDayStore>;
