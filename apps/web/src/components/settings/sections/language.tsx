import { Check, Languages } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
		<div className="space-y-8">
			<div>
				<p className="text-muted-foreground text-sm">
					{m["settings.language.desc"]()}
				</p>
			</div>

			<Card>
				<CardHeader className="border-b">
					<CardTitle className="text-base">
						{m["settings.language.title"]()}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-0.5 pt-4">
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
									"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
									isActive
										? "bg-accent font-medium text-foreground"
										: "text-muted-foreground active:bg-accent/50",
								)}
							>
								<Languages className="size-5" />
								<span className="flex-1">{LOCALE_NAMES[code]}</span>
								{isActive && <Check className="size-4 shrink-0 text-primary" />}
							</button>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
