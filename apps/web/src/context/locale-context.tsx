import { createContext, useContext } from "react";
import type { Locale } from "@/paraglide/runtime";

export interface LocaleContextValue {
	locale: Locale;
	setLocale: (next: Locale) => void;
}

/**
 * Active UI locale, held in React state by the root so switching languages
 * updates the app instantly without a full page reload. The root also keys the
 * routed subtree on `locale`, remounting it so every `m.*()` call re-resolves —
 * this refreshes React.memo'd components that a plain context change would skip.
 */
export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleContext(): LocaleContextValue {
	const ctx = useContext(LocaleContext);
	if (!ctx) {
		throw new Error("useLocaleContext must be used within a LocaleProvider");
	}
	return ctx;
}
