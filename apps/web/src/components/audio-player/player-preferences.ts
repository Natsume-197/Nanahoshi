export const JUMP_AMOUNTS = [10, 15, 30, 60] as const;
export type JumpAmount = (typeof JUMP_AMOUNTS)[number];

export const DEFAULT_JUMP_BACK: JumpAmount = 10;
export const DEFAULT_JUMP_FORWARD: JumpAmount = 30;

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 5;
export const SPEED_STEP = 0.1;

export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const SPEED_KEY = "audio-speed";
const JUMP_BACK_KEY = "audio-jump-back";
const JUMP_FORWARD_KEY = "audio-jump-forward";
const VOLUME_KEY = "audio-volume";
const ACTIVE_BOOK_KEY = "audio-active-book";

export function clampSpeed(value: number): number {
	if (!Number.isFinite(value)) return 1;
	const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
	return Math.round(clamped * 100) / 100;
}

export function nudgeSpeed(current: number, steps: number): number {
	return clampSpeed(
		Math.round((current + steps * SPEED_STEP) * 10 + Number.EPSILON) / 10,
	);
}

export function formatSpeed(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return `${Number.isInteger(rounded) ? rounded : rounded.toString()}×`;
}

export function normalizeJumpAmount(
	value: unknown,
	fallback: JumpAmount,
): JumpAmount {
	const parsed = typeof value === "string" ? Number(value) : value;
	return JUMP_AMOUNTS.includes(parsed as JumpAmount)
		? (parsed as JumpAmount)
		: fallback;
}

function readStored(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Private-mode quota errors must not break playback.
	}
}

export function readStoredSpeed(): number {
	const stored = readStored(SPEED_KEY);
	return stored ? clampSpeed(Number(stored)) : 1;
}

export function persistSpeed(value: number) {
	writeStored(SPEED_KEY, String(value));
}

export function readStoredJumpBack(): JumpAmount {
	return normalizeJumpAmount(readStored(JUMP_BACK_KEY), DEFAULT_JUMP_BACK);
}

export function readStoredJumpForward(): JumpAmount {
	return normalizeJumpAmount(
		readStored(JUMP_FORWARD_KEY),
		DEFAULT_JUMP_FORWARD,
	);
}

export function persistJumpBack(value: JumpAmount) {
	writeStored(JUMP_BACK_KEY, String(value));
}

export function persistJumpForward(value: JumpAmount) {
	writeStored(JUMP_FORWARD_KEY, String(value));
}

export function clampVolume(value: number): number {
	return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function readStoredVolume(): number {
	const stored = readStored(VOLUME_KEY);
	return stored ? clampVolume(Number(stored)) : 1;
}

export function persistVolume(value: number) {
	writeStored(VOLUME_KEY, String(value));
}

/** Which audiobook to bring back (paused) after a full page reload. */
export function readActiveBook(): string | null {
	return readStored(ACTIVE_BOOK_KEY);
}

export function persistActiveBook(uuid: string | null) {
	if (uuid) {
		writeStored(ACTIVE_BOOK_KEY, uuid);
		return;
	}
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(ACTIVE_BOOK_KEY);
	} catch {
		// Private-mode quota errors must not break playback.
	}
}
