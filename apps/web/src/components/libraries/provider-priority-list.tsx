import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type MediaType = "ebook" | "audiobook";
export type MetadataProviderId = "ranobedb" | "amazon" | "audible" | "itunes";

export interface ProviderEntry {
	id: MetadataProviderId;
	enabled: boolean;
}

const PROVIDER_INFO: Record<
	MetadataProviderId,
	{ label: string; description: string }
> = {
	ranobedb: {
		label: "RanobeDB",
		description: "Local light novel database — instant, no rate limits",
	},
	amazon: {
		label: "Amazon",
		description: "Web scraping — adds ratings, covers and missing fields",
	},
	audible: {
		label: "Audible",
		description: "Audible catalog + Audnexus — narrators, series and chapters",
	},
	itunes: {
		label: "Apple iTunes",
		description: "iTunes Search API — covers, descriptions and genres",
	},
};

const PROVIDERS_BY_MEDIA_TYPE: Record<MediaType, MetadataProviderId[]> = {
	ebook: ["ranobedb", "amazon"],
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
}: {
	value: ProviderEntry[];
	onChange: (value: ProviderEntry[]) => void;
	disabled?: boolean;
}) {
	const move = (index: number, delta: -1 | 1) => {
		const target = index + delta;
		if (target < 0 || target >= value.length) return;
		const next = [...value];
		const a = next[index];
		const b = next[target];
		if (!a || !b) return;
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
		<ul className="space-y-1.5">
			{value.map((entry, index) => {
				const info = PROVIDER_INFO[entry.id];
				return (
					<li
						key={entry.id}
						className={cn(
							"flex items-center gap-2 rounded-md border px-2.5 py-2",
							entry.enabled ? "border-border" : "border-border/50 opacity-60",
						)}
					>
						<span className="w-4 shrink-0 text-center font-mono text-muted-foreground text-xs">
							{entry.enabled ? index + 1 : "–"}
						</span>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-sm">{info.label}</p>
							<p className="truncate text-muted-foreground text-xs">
								{info.description}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-0.5">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7"
								disabled={disabled || index === 0}
								onClick={() => move(index, -1)}
								aria-label={`Move ${info.label} up`}
							>
								<ChevronUp className="size-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7"
								disabled={disabled || index === value.length - 1}
								onClick={() => move(index, 1)}
								aria-label={`Move ${info.label} down`}
							>
								<ChevronDown className="size-4" />
							</Button>
						</div>
						<Switch
							checked={entry.enabled}
							onCheckedChange={(checked) => toggle(index, checked)}
							disabled={disabled}
							aria-label={`Enable ${info.label}`}
						/>
					</li>
				);
			})}
		</ul>
	);
}
