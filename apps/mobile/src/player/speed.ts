import { clampSpeed } from "./timing";

const valid = (value: number | null | undefined): value is number =>
	typeof value === "number" && Number.isFinite(value);

/**
 * The speed a book opens at, as the web decides it: the server's rate for the
 * book (set on any device) wins, then the one this phone remembers for it,
 * then the default (the last speed picked anywhere). It's an override when it
 * differs from that default, which offers "use default" in the speed sheet.
 */
export function resolveBookSpeed({
	server,
	local,
	fallback,
}: {
	server?: number | null;
	local?: number | null;
	fallback: number;
}): { rate: number; override: boolean } {
	const rate = clampSpeed(
		valid(server) ? server : valid(local) ? local : fallback,
	);
	return { rate, override: rate !== clampSpeed(fallback) };
}
