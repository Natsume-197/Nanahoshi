import type { ReactElement } from "react";
import type { IconName } from "../icon-names";

export type ChoiceOption = {
	id: string;
	label: string;
	/** Android's sheet shows it; the iOS action sheet has no icons. */
	icon?: IconName;
	/** RN content in the icon's place on Android's sheet (a server's logo). */
	leading?: ReactElement;
	destructive?: boolean;
	/** The current value, when the question picks one of several. */
	selected?: boolean;
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

export type NoticeAction = { label: string; onPress: () => void };

export type Notice = {
	id: number;
	message: string;
	action?: NoticeAction;
	/** A confirmation rather than a failure. */
	info?: boolean;
};

/** The latest notice, cleared after `duration` unless a newer one replaced it.
 * One with an action stays twice as long, so there is time to reach it. */
export function createNoticeStore(duration = 3500) {
	let notice: Notice | null = null;
	let next = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const listeners = new Set<(notice: Notice | null) => void>();
	const emit = () => {
		for (const listener of listeners) listener(notice);
	};
	return {
		show(message: string, action?: NoticeAction, info?: boolean) {
			notice = { id: ++next, message, action, info };
			if (timer) clearTimeout(timer);
			timer = setTimeout(
				() => {
					notice = null;
					timer = null;
					emit();
				},
				action ? duration * 2 : duration,
			);
			emit();
		},
		get: () => notice,
		/** Runs the notice's action once and clears it. */
		act(id: number) {
			if (notice?.id !== id) return;
			const action = notice.action;
			notice = null;
			if (timer) clearTimeout(timer);
			timer = null;
			emit();
			action?.onPress();
		},
		subscribe(listener: (notice: Notice | null) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
