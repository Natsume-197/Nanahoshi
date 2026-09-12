import { AUDIOBOOK_PROVIDER_MANIFEST } from "@nanahoshi-v2/api/routers/audiobooks/metadata/providers/provider.manifest";
import { BOOK_PROVIDER_MANIFEST } from "@nanahoshi-v2/api/routers/books/metadata/providers/provider.manifest";
import {
	ArrowCounterClockwise,
	ArrowsClockwise,
	CaretDown,
	DotsSixVertical,
	FunnelSimple,
	MagnifyingGlass,
	Plus,
	PlusCircle,
	Trash,
	X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	type MediaType,
	type MetadataProviderId,
	PROVIDER_INFO,
} from "./provider-priority-list";

export type FieldRules = Record<string, MetadataProviderId[]>;
export type FieldUpdates = Record<string, "fill_gaps" | "if_provided">;
export function defaultFieldUpdates(mediaType: MediaType): FieldUpdates {
	const manifest =
		mediaType === "ebook"
			? BOOK_PROVIDER_MANIFEST
			: AUDIOBOOK_PROVIDER_MANIFEST;
	return Object.fromEntries(
		Object.values(manifest).flatMap((entry) =>
			entry.fields.map((field: string) => [field, "fill_gaps" as const]),
		),
	);
}
const FIELD_LABELS: Record<string, () => string> = {
	description: () => m["library.provider_field_description"](),
	cover: () => m["library.provider_field_cover"](),
	authors: () => m["library.provider_field_authors"](),
	narrators: () => m["library.provider_field_narrators"](),
	publisher: () => m["library.provider_field_publisher"](),
	series: () => m["library.provider_field_series"](),
	genres: () => m["library.provider_field_genres"](),
	tags: () => m["library.provider_field_tags"](),
	publishedDate: () => m["library.provider_field_publishedDate"](),
	rating: () => m["library.provider_field_rating"](),
	title: () => m["library.rules_title"](),
	subtitle: () => m["library.rules_subtitle"](),
	titleRomaji: () => m["library.rules_romaji"](),
	languageCode: () => m["library.rules_language"](),
	pageCount: () => m["library.rules_pages"](),
	isbn10: () => m["library.rules_isbn10"](),
	isbn13: () => m["library.rules_isbn13"](),
	isbn: () => m["library.rules_isbn"](),
	asin: () => m["library.rules_asin"](),
	duration: () => m["library.rules_duration"](),
	abridged: () => m["library.rules_abridged"](),
	audibleRating: () => m["library.rules_rating"](),
	ratingCount: () => m["library.rules_rating_count"](),
};

const PROVIDER_COLORS: Record<MetadataProviderId, string> = {
	googlebooks:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	amazon:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	ranobedb:
		"border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
	goodreads:
		"border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400",
	openlibrary: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
	hardcover:
		"border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400",
	comicvine:
		"border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-400",
	audible:
		"border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
	itunes: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const ADVANCED_FIELDS = new Set([
	"isbn10",
	"isbn13",
	"isbn",
	"asin",
	"ratingCount",
	"abridged",
]);

const GROUPS = [
	{
		label: () => m["library.rules_core"](),
		fields: ["title", "titleRomaji", "subtitle", "description", "cover"],
	},
	{
		label: () => m["library.rules_contributors"](),
		fields: ["authors", "narrators"],
	},
	{
		label: () => m["library.rules_publication"](),
		fields: [
			"publisher",
			"publishedDate",
			"languageCode",
			"pageCount",
			"duration",
			"rating",
			"audibleRating",
		],
	},
	{ label: () => m["library.rules_series"](), fields: ["series"] },
	{
		label: () => m["library.rules_classification"](),
		fields: ["genres", "tags"],
	},
	{
		label: () => m["library.rules_advanced"](),
		fields: [...ADVANCED_FIELDS],
		advanced: true,
	},
];

export function FieldRoutingEditor({
	mediaType,
	order,
	value,
	updates,
	pausedFields = {},
	onPausedFieldsChange,
	onChange,
	onUpdatesChange,
	defaults = {},
	disabled = false,
}: {
	mediaType: MediaType;
	order: MetadataProviderId[];
	value: FieldRules;
	updates: FieldUpdates;
	pausedFields?: FieldRules;
	onPausedFieldsChange: (value: FieldRules) => void;
	onChange: (value: FieldRules) => void;
	onUpdatesChange: (updates: FieldUpdates) => void;
	defaults?: FieldRules;
	disabled?: boolean;
}) {
	const [search, setSearch] = useState("");
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [undo, setUndo] = useState<{
		rules: FieldRules;
		updates: FieldUpdates;
		paused: FieldRules;
		order: string;
	} | null>(null);
	const providerOrder = order.join(",");
	useEffect(() => {
		if (undo && undo.order !== providerOrder) setUndo(null);
	}, [providerOrder, undo]);
	const snapshot = () =>
		setUndo(
			structuredClone({
				rules: value,
				updates,
				paused: pausedFields,
				order: providerOrder,
			}),
		);
	const [providerFilter, setProviderFilter] =
		useState<MetadataProviderId | null>(null);
	const [drag, setDrag] = useState<{
		field: string;
		id: MetadataProviderId;
	} | null>(null);
	const manifest =
		mediaType === "ebook"
			? BOOK_PROVIDER_MANIFEST
			: AUDIOBOOK_PROVIDER_MANIFEST;
	const supports = (id: MetadataProviderId, field: string) => {
		const entry = (manifest as Record<string, { fields: readonly string[] }>)[
			id
		];
		return entry?.fields.includes(field) ?? false;
	};
	const knownFields = new Set<string>(
		Object.values(manifest).flatMap((entry) => [...entry.fields]),
	);
	const groups = GROUPS.map((group) => ({
		...group,
		fields: group.fields.filter(
			(field) =>
				knownFields.has(field) &&
				(!providerFilter ||
					((value[field] ?? order).includes(providerFilter) &&
						order.includes(providerFilter) &&
						supports(providerFilter, field))) &&
				(FIELD_LABELS[field]?.() ?? field)
					.toLocaleLowerCase()
					.includes(search.toLocaleLowerCase()),
		),
	})).filter((group) => group.fields.length > 0);
	const setRule = (field: string, rule: MetadataProviderId[]) => {
		setUndo(null);
		onChange({ ...value, [field]: rule });
	};
	const toggleField = (
		field: string,
		checked: boolean,
		ids: MetadataProviderId[],
		compatible: MetadataProviderId[],
	) => {
		if (!checked)
			onPausedFieldsChange({
				...pausedFields,
				[field]: [...(value[field] ?? ids)],
			});
		else {
			const paused = { ...pausedFields };
			delete paused[field];
			onPausedFieldsChange(paused);
		}
		setRule(field, checked ? (pausedFields[field] ?? compatible) : []);
	};
	const restore = (field: string) => {
		setUndo(null);
		const paused = { ...pausedFields };
		delete paused[field];
		onPausedFieldsChange(paused);
		const next = { ...value };
		delete next[field];
		if (defaults[field]) next[field] = [...defaults[field]];
		onChange(next);
		const modes = { ...updates };
		modes[field] = "fill_gaps";
		onUpdatesChange(modes);
	};
	const gridClass =
		"grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_260px] md:gap-5";
	return (
		<div className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
			<div className="flex flex-wrap items-center gap-3 border-border/70 border-b p-4">
				<div className="relative w-full sm:w-64">
					<MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-10 rounded-lg border border-border/70 bg-background/60 pl-9 shadow-none"
						placeholder={m["library.rules_search"]()}
						aria-label={m["library.rules_search"]()}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="h-10 rounded-lg">
							<FunnelSimple />
							{providerFilter
								? PROVIDER_INFO[providerFilter].label
								: m["library.rules_any_provider"]()}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onClick={() => setProviderFilter(null)}>
							{m["library.rules_any_provider"]()}
						</DropdownMenuItem>
						{order.map((id) => (
							<DropdownMenuItem key={id} onClick={() => setProviderFilter(id)}>
								{PROVIDER_INFO[id].label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="flex flex-wrap gap-2 sm:ml-auto">
					{undo && (
						<Button
							variant="ghost"
							disabled={disabled}
							onClick={() => {
								onChange(undo.rules);
								onUpdatesChange(undo.updates);
								onPausedFieldsChange(undo.paused);
								setUndo(null);
							}}
						>
							{m["library.rules_undo"]()}
						</Button>
					)}
					<Button
						variant="outline"
						className="h-10 rounded-lg border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
						disabled={disabled}
						onClick={() => {
							snapshot();
							onPausedFieldsChange({
								...pausedFields,
								...Object.fromEntries(
									[...knownFields]
										.filter((field) => value[field]?.length !== 0)
										.map((field) => [field, [...(value[field] ?? order)]]),
								),
							});
							onChange(
								Object.fromEntries(
									[...knownFields].map((field) => [field, []]),
								),
							);
						}}
					>
						<Trash />
						{m["library.rules_clear"]()}
					</Button>
					<Button
						variant="outline"
						className="h-10 rounded-lg"
						disabled={disabled}
						onClick={() => {
							snapshot();
							onPausedFieldsChange({});
							onChange(
								Object.fromEntries(
									Object.entries(defaults).map(([field, ids]) => [
										field,
										[...ids],
									]),
								),
							);
							onUpdatesChange(defaultFieldUpdates(mediaType));
						}}
					>
						<ArrowCounterClockwise />
						{m["library.rules_restore"]()}
					</Button>
				</div>
			</div>
			<div
				className={cn(
					gridClass,
					"hidden border-border/70 border-b bg-muted/30 px-5 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wide md:grid",
				)}
			>
				<span>{m["library.rules_field"]()}</span>
				<span>{m["library.rules_providers"]()}</span>
				<span>{m["library.rules_update"]()}</span>
			</div>
			{groups.length === 0 && (
				<p className="p-8 text-center text-muted-foreground text-sm">
					{m["library.rules_empty"]()}
				</p>
			)}
			{groups.map((group) => (
				<section key={group.label()}>
					<div className="flex items-center justify-between border-border/50 border-y bg-muted/25 px-5 py-2">
						<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
							{"advanced" in group ? (
								<button
									type="button"
									className="flex items-center gap-2"
									aria-expanded={
										advancedOpen || search.length > 0 || providerFilter !== null
									}
									onClick={() => setAdvancedOpen(!advancedOpen)}
								>
									{group.label()}
									<CaretDown
										className={cn(
											"size-3 transition-transform",
											advancedOpen && "rotate-180",
										)}
									/>
								</button>
							) : (
								group.label()
							)}
						</h4>
						<span className="text-muted-foreground text-xs">
							{m["library.rules_enabled_count"]({
								enabled: String(
									group.fields.filter((field) => value[field]?.length !== 0)
										.length,
								),
								total: String(group.fields.length),
							})}
						</span>
					</div>
					{(!("advanced" in group) ||
					advancedOpen ||
					search.length > 0 ||
					providerFilter !== null
						? group.fields
						: []
					).map((field) => {
						const compatible = order.filter((id) => supports(id, field));
						const ids = (value[field] ?? order).filter(
							(id) => order.includes(id) && supports(id, field),
						);
						const enabled = value[field]?.length !== 0;
						const custom =
							(updates[field] ?? "fill_gaps") !== "fill_gaps" ||
							JSON.stringify(value[field]) !== JSON.stringify(defaults[field]);
						const label = FIELD_LABELS[field]?.() ?? field;
						const move = (id: MetadataProviderId, target: number) => {
							const next = [...ids];
							const index = next.indexOf(id);
							if (index < 0 || target < 0 || target >= next.length) return;
							next.splice(index, 1);
							next.splice(target, 0, id);
							setRule(field, next);
						};
						const mode = updates[field] ?? "fill_gaps";
						return (
							<div
								key={field}
								className={cn(
									gridClass,
									"group/row min-h-16 items-center border-border/40 border-b px-5 py-3 transition-colors last:border-0 hover:bg-muted/15",
									!enabled && "bg-muted/10",
								)}
							>
								<div className="flex items-center gap-3">
									<Switch
										checked={enabled}
										disabled={disabled || (!enabled && compatible.length === 0)}
										aria-label={label}
										onCheckedChange={(checked) =>
											toggleField(field, checked, ids, compatible)
										}
									/>
									<span
										className={cn(
											"font-medium text-sm",
											!enabled && "text-muted-foreground",
										)}
									>
										{label}
									</span>
									{custom && (
										<span
											className="size-1.5 shrink-0 rounded-full bg-primary"
											title={m["library.rules_custom"]()}
										/>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{ids.map((id, index) => (
										<fieldset
											key={id}
											draggable={!disabled}
											onDragStart={() => setDrag({ field, id })}
											onDragEnd={() => setDrag(null)}
											onDragOver={(event) => {
												if (!disabled && drag?.field === field)
													event.preventDefault();
											}}
											onDrop={(event) => {
												event.preventDefault();
												if (!disabled && drag?.field === field)
													move(drag.id, index);
												setDrag(null);
											}}
											className={cn(
												"flex min-w-0 items-center rounded-md border text-sm transition-opacity",
												PROVIDER_COLORS[id],
												drag?.field === field && drag.id === id && "opacity-40",
											)}
										>
											<button
												type="button"
												disabled={disabled}
												title={m["library.rules_reorder"]()}
												aria-label={`${PROVIDER_INFO[id].label}, ${label}: ${m["library.rules_reorder"]()}`}
												onKeyDown={(event) => {
													if (
														event.key === "ArrowLeft" ||
														event.key === "ArrowRight"
													) {
														event.preventDefault();
														move(
															id,
															index + (event.key === "ArrowLeft" ? -1 : 1),
														);
													}
												}}
												className="flex cursor-grab items-center gap-1.5 rounded-l-md py-1.5 pr-1.5 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
											>
												<DotsSixVertical className="size-3.5 opacity-60" />
												<span className="opacity-65">{index + 1}</span>
												<span className="whitespace-nowrap font-medium">
													{PROVIDER_INFO[id].label}
												</span>
											</button>
											<button
												type="button"
												disabled={disabled}
												aria-label={`${m["library.rules_remove"]()}: ${PROVIDER_INFO[id].label}, ${label}`}
												onClick={() =>
													setRule(
														field,
														ids.filter((p) => p !== id),
													)
												}
												className="mr-1 rounded p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
											>
												<X className="size-3.5" />
											</button>
										</fieldset>
									))}
									{ids.length === 0 && (
										<span className="text-muted-foreground text-xs">
											{enabled
												? m["library.rules_no_providers"]()
												: m["library.rules_disabled"]()}
										</span>
									)}
									{compatible.some((id) => !ids.includes(id)) && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													disabled={disabled}
													aria-label={`${m["library.rules_add"]()}: ${label}`}
													className="flex items-center gap-1 rounded-md border border-border border-dashed px-2.5 py-1.5 text-muted-foreground text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
												>
													<Plus className="size-3.5" />
													{m["library.rules_add_short"]()}
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent>
												{compatible
													.filter((id) => !ids.includes(id))
													.map((id) => (
														<DropdownMenuItem
															key={id}
															onClick={() => setRule(field, [...ids, id])}
														>
															{PROVIDER_INFO[id].label}
														</DropdownMenuItem>
													))}
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
								<div className="flex items-center gap-2">
									<fieldset
										aria-label={`${m["library.rules_update"]()}: ${label}`}
										disabled={disabled || !enabled}
										className="flex min-w-0 flex-1 items-center rounded-lg border border-border/70 bg-muted/35 p-1 disabled:opacity-40"
									>
										<button
											type="button"
											aria-pressed={mode === "fill_gaps"}
											title={m["library.rules_fill_help"]()}
											onClick={() => {
												setUndo(null);
												onUpdatesChange({ ...updates, [field]: "fill_gaps" });
											}}
											className={cn(
												"flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary",
												mode === "fill_gaps"
													? "bg-background font-medium text-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											<PlusCircle className="size-3.5" />
											{m["library.rules_fill"]()}
										</button>
										<button
											type="button"
											aria-pressed={mode === "if_provided"}
											title={m["library.rules_replace_help"]()}
											onClick={() => {
												setUndo(null);
												onUpdatesChange({ ...updates, [field]: "if_provided" });
											}}
											className={cn(
												"flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary",
												mode === "if_provided"
													? "bg-background font-medium text-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											<ArrowsClockwise className="size-3.5" />
											{m["library.rules_replace_short"]()}
										</button>
									</fieldset>
									<button
										type="button"
										disabled={disabled || !custom}
										title={
											custom
												? m["library.field_reset_rule"]()
												: m["library.rules_default_help"]()
										}
										aria-label={`${m["library.field_reset_rule"]()}: ${label}`}
										onClick={() => restore(field)}
										className="rounded-md p-1.5 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-15"
									>
										<ArrowCounterClockwise className="size-4" />
									</button>
								</div>
							</div>
						);
					})}
				</section>
			))}
		</div>
	);
}
