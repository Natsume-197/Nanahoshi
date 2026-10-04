export type ChoiceOption = {
	id: string;
	label: string;
	destructive?: boolean;
};

export type ChoiceRequest = {
	title: string;
	message?: string;
	options: ChoiceOption[];
};

type Pending = ChoiceRequest & { resolve: (id: string | null) => void };

/**
 * One question at a time, answered from a sheet. A new question dismisses
 * the one still open (it resolves null, as if swiped away).
 */
export function createChoiceStore() {
	let pending: Pending | null = null;
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	const settle = (id: string | null) => {
		const current = pending;
		if (!current) return;
		pending = null;
		current.resolve(id);
		emit();
	};
	return {
		ask(request: ChoiceRequest) {
			settle(null);
			return new Promise<string | null>((resolve) => {
				pending = { ...request, resolve };
				emit();
			});
		},
		/** The row picked, or null when the sheet went away without one. */
		answer: settle,
		get: () => pending as ChoiceRequest | null,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type Notice = { id: number; message: string };

/** The latest notice, cleared after `duration` unless a newer one replaced it. */
export function createNoticeStore(duration = 3500) {
	let notice: Notice | null = null;
	let next = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const listeners = new Set<(notice: Notice | null) => void>();
	const emit = () => {
		for (const listener of listeners) listener(notice);
	};
	return {
		show(message: string) {
			notice = { id: ++next, message };
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				notice = null;
				timer = null;
				emit();
			}, duration);
			emit();
		},
		get: () => notice,
		subscribe(listener: (notice: Notice | null) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
