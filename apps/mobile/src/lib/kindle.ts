import * as SecureStore from "expo-secure-store";

// The server accepts only these; checking here saves a round trip.
const KINDLE_DOMAINS = new Set([
	"kindle.com",
	"kindle.cn",
	"kindle.co.jp",
	"free.kindle.com",
	"kindle.co.uk",
]);

export type KindleEmailProblem = "invalid" | "not_kindle";

export function kindleEmailProblem(email: string): KindleEmailProblem | null {
	const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email.trim());
	if (!match) return "invalid";
	return KINDLE_DOMAINS.has(match[1].toLowerCase()) ? null : "not_kindle";
}

const KEY = "nanahoshi.kindle-email";

/** The last address a book went to, so the next send is one tap. */
export const lastKindleEmail = {
	read: (): string => SecureStore.getItem(KEY) ?? "",
	write: (email: string) => SecureStore.setItemAsync(KEY, email.trim()),
};
