import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, GearSix } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

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
export const PROVIDER_INFO: Record<
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

export const PROVIDERS_BY_MEDIA_TYPE = {
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
} as const satisfies Record<MediaType, readonly MetadataProviderId[]>;

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
	const allowed: readonly MetadataProviderId[] =
		PROVIDERS_BY_MEDIA_TYPE[mediaType];
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

export function reorderProviderEntries(
	value: ProviderEntry[],
	activeId: MetadataProviderId,
	overId: MetadataProviderId,
): ProviderEntry[] {
	const active = value.filter((entry) => entry.enabled);
	const inactive = value.filter((entry) => !entry.enabled);
	const from = active.findIndex((entry) => entry.id === activeId);
	const to = active.findIndex((entry) => entry.id === overId);
	if (from === -1 || to === -1 || from === to) return value;
	return [...arrayMove(active, from, to), ...inactive];
}

function SortableProviderRow({
	entry,
	disabled,
	disableToggle,
	control,
	onEnabledChange,
}: {
	entry: ProviderEntry;
	disabled: boolean;
	disableToggle: boolean;
	control?: ReactNode;
	onEnabledChange: (enabled: boolean) => void;
}) {
	const info = PROVIDER_INFO[entry.id];
	const [settingsOpen, setSettingsOpen] = useState(false);
	const sortable = entry.enabled;
	const {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: entry.id, disabled: disabled || !sortable });
	const style: CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
	};
	const checkboxId = `available-provider-${entry.id}`;

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={cn(
				"group rounded-lg border motion-safe:transition-colors",
				entry.enabled
					? "border-border bg-card"
					: "border-transparent bg-muted/30",
				isDragging && "relative z-10 bg-card shadow-md",
			)}
		>
			<div className="flex items-center gap-3 px-3 py-2.5">
				<Checkbox
					id={checkboxId}
					checked={entry.enabled}
					onCheckedChange={onEnabledChange}
					disabled={disabled || (entry.enabled && disableToggle)}
					aria-label={m["library.provider_enable"]({ name: info.label })}
				/>
				<Label
					htmlFor={checkboxId}
					aria-label={m["library.provider_enable"]({ name: info.label })}
					className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-foreground text-sm"
				>
					<span>{info.label}</span>
					<span className="font-normal text-muted-foreground text-xs leading-relaxed">
						{info.description()}
					</span>
				</Label>
				{control && entry.id === "amazon" && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0 text-muted-foreground"
						disabled={disabled}
						onClick={() => setSettingsOpen(true)}
						aria-label={m["library.amazon_store"]()}
						title={m["library.amazon_store"]()}
						aria-haspopup="dialog"
					>
						<GearSix aria-hidden="true" />
					</Button>
				)}
				{sortable && (
					<Button
						ref={setActivatorNodeRef}
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
						disabled={disabled}
						{...attributes}
						{...listeners}
						aria-label={m["library.provider_drag"]({ name: info.label })}
					>
						<DotsSixVertical aria-hidden="true" />
					</Button>
				)}
			</div>
			{control &&
				(entry.id === "amazon" ? (
					<Modal
						open={settingsOpen}
						onOpenChange={setSettingsOpen}
						title={m["library.amazon_store"]()}
					>
						{control}
					</Modal>
				) : (
					<div className="mx-3 border-border/60 border-t py-3">{control}</div>
				))}
		</li>
	);
}

export function ProviderPriorityList({
	value,
	onChange,
	disabled = false,
	providerControls,
}: {
	value: ProviderEntry[];
	onChange: (value: ProviderEntry[]) => void;
	disabled?: boolean;
	providerControls?: Partial<Record<MetadataProviderId, ReactNode>>;
}) {
	const activeProviders = value.filter((entry) => entry.enabled);
	const inactive = value.filter((entry) => !entry.enabled);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const toggle = (index: number, enabled: boolean) => {
		const next = value.map((entry, i) =>
			i === index ? { ...entry, enabled } : entry,
		);
		onChange(next);
	};
	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over) return;
		onChange(
			reorderProviderEntries(
				value,
				active.id as MetadataProviderId,
				over.id as MetadataProviderId,
			),
		);
	};
	const dragLabel = (id: string | number) =>
		PROVIDER_INFO[id as MetadataProviderId].label;
	const dragPosition = (id: string | number) =>
		activeProviders.findIndex((entry) => entry.id === id) + 1;
	if (value.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				{m["library.rules_no_providers"]()}
			</p>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragEnd={handleDragEnd}
			accessibility={{
				screenReaderInstructions: {
					draggable: m["library.provider_drag_instructions"](),
				},
				announcements: {
					onDragStart: ({ active }) =>
						m["library.provider_drag_started"]({
							name: dragLabel(active.id),
						}),
					onDragOver: ({ active, over }) =>
						over
							? m["library.provider_drag_position"]({
									name: dragLabel(active.id),
									position: dragPosition(over.id),
									total: activeProviders.length,
								})
							: undefined,
					onDragEnd: ({ active, over }) =>
						over
							? m["library.provider_drag_finished"]({
									name: dragLabel(active.id),
									position: dragPosition(over.id),
									total: activeProviders.length,
								})
							: m["library.provider_drag_cancelled"]({
									name: dragLabel(active.id),
								}),
					onDragCancel: ({ active }) =>
						m["library.provider_drag_cancelled"]({
							name: dragLabel(active.id),
						}),
				},
			}}
		>
			<ul className="flex flex-col gap-1.5">
				<SortableContext
					items={activeProviders.map((entry) => entry.id)}
					strategy={verticalListSortingStrategy}
				>
					{activeProviders.map((entry) => (
						<SortableProviderRow
							key={entry.id}
							entry={entry}
							disabled={disabled}
							disableToggle={activeProviders.length === 1}
							control={providerControls?.[entry.id]}
							onEnabledChange={(enabled) =>
								toggle(
									value.findIndex((provider) => provider.id === entry.id),
									enabled,
								)
							}
						/>
					))}
				</SortableContext>
				{inactive.map((entry) => (
					<SortableProviderRow
						key={entry.id}
						entry={entry}
						disabled={disabled}
						disableToggle={false}
						onEnabledChange={(enabled) =>
							toggle(
								value.findIndex((provider) => provider.id === entry.id),
								enabled,
							)
						}
					/>
				))}
			</ul>
		</DndContext>
	);
}
