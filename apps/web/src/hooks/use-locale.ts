import { useLocaleContext } from "@/context/locale-context";
import { locales } from "@/paraglide/runtime";

/**
 * App UI language. Backed by {@link LocaleContext} (state held in the root),
 * persisted to Paraglide's `locale` cookie. Switching updates the app instantly
 * without a page reload — see the root's `key`-based remount.
 */
export function useLocale() {
	const { locale, setLocale } = useLocaleContext();
	return { locale, locales, setLocale } as const;
}
