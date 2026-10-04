type Storage = {
	read: () => boolean;
	write: (on: boolean) => Promise<void>;
};

export type PersistedFlag = ReturnType<typeof createPersistedFlag>;

/** A persisted on/off flag with listeners; the storage is injected so the
 * logic stays testable without native modules. */
export function createPersistedFlag(storage: Storage) {
	let on = storage.read();
	const listeners = new Set<() => void>();
	return {
		isOn: () => on,
		async set(next: boolean) {
			if (next === on) return;
			on = next;
			for (const listener of listeners) listener();
			await storage.write(next);
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
