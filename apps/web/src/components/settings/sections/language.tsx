import { Check, Translate } from "@phosphor-icons/react";
import { SettingRows } from "@/components/settings/setting-rows";
import { useLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";

// Language names are shown as endonyms (in their own language), the standard
// convention for a language switcher regardless of the active UI locale.
const LOCALE_NAMES: Record<Locale, string> = {
	en: "English",
	es: "Español",
};

export function LanguageSettings() {
	const { locale, locales, setLocale } = useLocale();

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.language.title"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{m["settings.language.desc"]()}
					</p>
				</div>
				<SettingRows>
					{locales.map((code) => {
						const isActive = code === locale;
						return (
							<button
								key={code}
								type="button"
								onClick={() => {
									if (!isActive) setLocale(code);
								}}
								className={cn(
									"flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors",
									isActive
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted/60 active:bg-muted",
								)}
							>
								<Translate className="size-5" />
								<span className="flex-1">{LOCALE_NAMES[code]}</span>
								{isActive && <Check className="size-4 shrink-0 text-primary" />}
							</button>
						);
					})}
				</SettingRows>
			</section>
		</div>
	);
}
