import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getActiveProviderPositions } from "./library-ui-state";

export type MediaType = "ebook" | "audiobook";
export type MetadataProviderId =
	| "ranobedb"
	| "amazon"
	| "googlebooks"
	| "openlibrary"
	| "goodreads"
	| "hardcover"
	| "comicvine"
	| "audible"
	| "itunes";

export interface ProviderEntry {
	id: MetadataProviderId;
	enabled: boolean;
}

// Labels are brand names; descriptions resolve in the viewer's locale.
const PROVIDER_INFO: Record<
	MetadataProviderId,
	{ label: string; description: () => string }
> = {
	ranobedb: {
		label: "RanobeDB",
		description: () => m["library.provider_ranobedb_desc"](),
	},
	amazon: {
		label: "Amazon",
		description: () => m["library.provider_amazon_desc"](),
	},
	googlebooks: {
		label: "Google Books",
		description: () => m["library.provider_googlebooks_desc"](),
	},
	openlibrary: {
		label: "Open Library",
		description: () => m["library.provider_openlibrary_desc"](),
	},
	goodreads: {
		label: "Goodreads",
		description: () => m["library.provider_goodreads_desc"](),
	},
	hardcover: {
		label: "Hardcover",
		description: () => m["library.provider_hardcover_desc"](),
	},
	comicvine: {
		label: "Comic Vine",
		description: () => m["library.provider_comicvine_desc"](),
	},
	audible: {
		label: "Audible",
		description: () => m["library.provider_audible_desc"](),
	},
	itunes: {
		label: "Apple iTunes",
		description: () => m["library.provider_itunes_desc"](),
	},
};

const PROVIDERS_BY_MEDIA_TYPE: Record<MediaType, MetadataProviderId[]> = {
	ebook: [
		"ranobedb",
		"amazon",
		"googlebooks",
		"openlibrary",
		"goodreads",
		"hardcover",
		"comicvine",
	],
	audiobook: ["audible", "itunes"],
};

export function defaultProviderEntries(mediaType: MediaType): ProviderEntry[] {
	return PROVIDERS_BY_MEDIA_TYPE[mediaType].map((id) => ({
		id,
		enabled: true,
	}));
}

/** Builds entries from a saved priority list: saved ones first (enabled), the rest disabled. */
export function toProviderEntries(
	mediaType: MediaType,
	saved?: string[] | null,
): ProviderEntry[] {
	const allowed = PROVIDERS_BY_MEDIA_TYPE[mediaType];
	// Stale ids from the other media type filter out → defaults (matches backend).
	const known = (saved ?? []).filter((id): id is MetadataProviderId =>
		allowed.includes(id as MetadataProviderId),
	);
	if (known.length === 0) return defaultProviderEntries(mediaType);
	const missing = allowed.filter((id) => !known.includes(id));
	return [
		...known.map((id) => ({ id, enabled: true })),
		...missing.map((id) => ({ id, enabled: false })),
	];
}

export function toProviderIds(entries: ProviderEntry[]): MetadataProviderId[] {
	return entries.filter((e) => e.enabled).map((e) => e.id);
}

export function ProviderPriorityList({
	value,
	onChange,
	disabled = false,
	requiredProviderId,
}: {
	value: ProviderEntry[];
	onChange: (value: ProviderEntry[]) => void;
	disabled?: boolean;
	/** An authoritative profile provider cannot be disabled. */
	requiredProviderId?: MetadataProviderId;
}) {
	const activePositions = getActiveProviderPositions(value);
	const move = (index: number, delta: -1 | 1) => {
		const target = index + delta;
		if (target < 0 || target >= value.length) return;
		const next = [...value];
		const a = next[index];
		const b = next[target];
		if (!a || !b) return;
		if (a.id === requiredProviderId || b.id === requiredProviderId) return;
		next[index] = b;
		next[target] = a;
		onChange(next);
	};

	const toggle = (index: number, enabled: boolean) => {
		const next = value.map((entry, i) =>
			i === index ? { ...entry, enabled } : entry,
		);
		onChange(next);
	};

	return (
		<ul className="flex flex-col">
			{value.map((entry, index) => {
				const info = PROVIDER_INFO[entry.id];
				return (
					<li key={entry.id} className={cn(!entry.enabled && "opacity-60")}>
						<div className="flex min-h-16 items-center gap-3 py-3">
							<span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-mono text-secondary-foreground text-xs tabular-nums">
								{entry.enabled ? activePositions.get(entry.id) : "–"}
							</span>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-foreground text-sm">
									{info.label}
								</p>
								<p className="line-clamp-2 text-muted-foreground text-xs">
									{info.description()}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-0.5">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-10 sm:size-8"
									disabled={
										disabled ||
										index === 0 ||
										entry.id === requiredProviderId ||
										value[index - 1]?.id === requiredProviderId
									}
									onClick={() => move(index, -1)}
									aria-label={m["library.provider_move_up"]({
										name: info.label,
									})}
								>
									<CaretUp />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-10 sm:size-8"
									disabled={
										disabled ||
										index === value.length - 1 ||
										entry.id === requiredProviderId ||
										value[index + 1]?.id === requiredProviderId
									}
									onClick={() => move(index, 1)}
									aria-label={m["library.provider_move_down"]({
										name: info.label,
									})}
								>
									<CaretDown />
								</Button>
							</div>
							<Switch
								checked={entry.enabled}
								onCheckedChange={(checked) => toggle(index, checked)}
								disabled={disabled || entry.id === requiredProviderId}
								aria-label={m["library.provider_enable"]({ name: info.label })}
							/>
						</div>
						{index < value.length - 1 && <Separator className="bg-border/60" />}
					</li>
				);
			})}
		</ul>
	);
}
