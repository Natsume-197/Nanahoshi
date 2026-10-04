// Nanahoshi is "seven stars": a fresh instance is named after one of them.
const ADJECTIVES = [
	"Quiet",
	"Bright",
	"Distant",
	"Silver",
	"Northern",
	"Hidden",
	"Wandering",
	"Gentle",
	"Midnight",
	"Amber",
	"Little",
	"Golden",
] as const;

const STARS = [
	"Vega",
	"Altair",
	"Deneb",
	"Sirius",
	"Polaris",
	"Rigel",
	"Spica",
	"Mizar",
	"Alcor",
	"Capella",
	"Lyra",
	"Subaru",
	"Arcturus",
	"Antares",
] as const;

export const INSTANCE_NAME_MAX = 60;

export function randomInstanceName(random: () => number = Math.random) {
	const pick = <T>(list: readonly T[]) =>
		list[Math.floor(random() * list.length)] as T;
	return `${pick(ADJECTIVES)} ${pick(STARS)}`;
}

/** Collapses inner whitespace; empty or oversized names are rejected upstream. */
export function normalizeInstanceName(name: string) {
	return name.trim().replace(/\s+/g, " ");
}
