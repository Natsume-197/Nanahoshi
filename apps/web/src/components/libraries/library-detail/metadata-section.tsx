import type {
	LibraryComplete,
	MetadataConfig,
	MetadataProvidersConfig,
} from "@nanahoshi/api/routers/libraries/library.model";
import { CircleNotch, FloppyDisk } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import {
	defaultFieldUpdates,
	FieldRoutingEditor,
	type FieldRules,
	type FieldUpdates,
} from "@/components/libraries/field-routing-editor";
import {
	type MetadataProviderId,
	type ProviderEntry,
	ProviderPriorityList,
	toProviderEntries,
	toProviderIds,
} from "@/components/libraries/provider-priority-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { AMAZON_DOMAINS } from "@/lib/amazon-domains";
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION } from "@/lib/audible-regions";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

// Sentinel for "inherit the organization's default Amazon store".
const ORG_DEFAULT = "__default__";

// metadata_providers holds either the legacy ordered array or the routed
// { order, fields } shape; this section edits the order and must not drop
// any per-field rules configured elsewhere.
type ProvidersConfig = LibraryComplete["metadataProviders"];
const orderOf = (config: ProvidersConfig): string[] =>
	Array.isArray(config) ? config : config.order;
const fieldRulesOf = (config: ProvidersConfig): FieldRules =>
	Array.isArray(config) ? {} : ((config.fields ?? {}) as FieldRules);
const pausedOf = (config: ProvidersConfig): FieldRules =>
	Array.isArray(config) ? {} : ((config.pausedFields ?? {}) as FieldRules);
const updatesOf = (
	config: ProvidersConfig,
	mediaType: LibraryComplete["mediaType"],
): FieldUpdates => ({
	...defaultFieldUpdates(mediaType),
	...(Array.isArray(config) ? {} : (config.updates ?? {})),
});
export type MetadataDraft = {
	metadataProviders: MetadataProvidersConfig;
	metadataConfig: MetadataConfig;
};

type MetadataSectionProps = {
	library: Pick<
		LibraryComplete,
		"mediaType" | "metadataProviders" | "metadataConfig"
	> & { uuid?: string };
	canManage: boolean;
	onDirtyChange?: (dirty: boolean) => void;
	onDraftChange?: (draft: MetadataDraft) => void;
	headingRef?: RefObject<HTMLHeadingElement | null>;
};

export function MetadataSection(props: MetadataSectionProps) {
	const { data: availability } = useQuery(
		orpc.libraries.getMetadataProviderAvailability.queryOptions(),
	);
	return (
		<MetadataSectionEditor
			key={JSON.stringify(props.library)}
			{...props}
			availability={availability}
		/>
	);
}

function MetadataSectionEditor({
	library,
	canManage,
	onDirtyChange,
	onDraftChange,
	headingRef,
	availability,
}: MetadataSectionProps & { availability?: Record<string, boolean> }) {
	const isAudiobook = library.mediaType === "audiobook";
	const savedDomain = library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT;
	const savedRegion =
		library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION;
	const allowed =
		isAudiobook || !availability
			? null
			: new Set(
					Object.entries(availability).flatMap(([id, enabled]) =>
						enabled ? [id] : [],
					),
				);
	const pruneRules = (rules: FieldRules): FieldRules =>
		allowed
			? Object.fromEntries(
					Object.entries(rules).map(([field, ids]) => [
						field,
						ids.filter((id) => allowed.has(id)),
					]),
				)
			: rules;
	const initial = {
		providers: toProviderEntries(
			library.mediaType,
			orderOf(library.metadataProviders),
		).filter((entry) => !allowed || allowed.has(entry.id)),
		fieldRules: pruneRules(fieldRulesOf(library.metadataProviders)),
		fieldUpdates: updatesOf(library.metadataProviders, library.mediaType),
		pausedFields: pruneRules(pausedOf(library.metadataProviders)),
		amazonDomain: savedDomain,
		audibleRegion: savedRegion,
	};
	const [state, setState] = useState(initial);
	const stateRef = useRef(state);
	stateRef.current = state;
	const {
		providers,
		fieldRules,
		fieldUpdates,
		pausedFields,
		amazonDomain,
		audibleRegion,
	} = state;
	const [editorVersion, setEditorVersion] = useState(0);
	const toDraft = (value: typeof state): MetadataDraft => ({
		metadataProviders: {
			order: toProviderIds(
				value.providers.filter((entry) => !allowed || allowed.has(entry.id)),
			),
			fields: pruneRules(value.fieldRules),
			updates: value.fieldUpdates,
			pausedFields: pruneRules(value.pausedFields),
		},
		metadataConfig: isAudiobook
			? { audible: { region: value.audibleRegion } }
			: value.amazonDomain !== ORG_DEFAULT
				? { amazon: { domain: value.amazonDomain } }
				: {},
	});
	const isChanged = (value: typeof state) =>
		JSON.stringify(toDraft(value)) !== JSON.stringify(toDraft(initial));
	const change = (patch: Partial<typeof state>) => {
		const next = { ...stateRef.current, ...patch };
		stateRef.current = next;
		setState(next);
		onDirtyChange?.(isChanged(next));
		onDraftChange?.(toDraft(next));
	};
	useMountEffect(() => {
		onDirtyChange?.(false);

		return () => onDirtyChange?.(false);
	});

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.metadata_updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	// Surface the inherited org default so the "use default" option is concrete.
	// There is no org-level Audible setting, so audiobooks skip this query.
	const { data: orgAmazon } = useQuery({
		...orpc.settings.getAmazon.queryOptions(),
		enabled: !isAudiobook,
	});
	const availableProviders = providers.filter(
		(entry) => !allowed || allowed.has(entry.id),
	);
	const orgDomainLabel = AMAZON_DOMAINS.find(
		(d) => d.value === orgAmazon?.domain,
	)?.label;
	const changed = isChanged(state);

	// base-ui's Select.Value renders the raw value unless the Root gets `items`.
	const audibleItems = AUDIBLE_REGIONS.map((r) => ({
		value: r.value,
		label:
			r.value === DEFAULT_AUDIBLE_REGION
				? `${r.label} — ${m["library.default_suffix"]()}`
				: r.label,
	}));
	const amazonItems = [
		{
			value: ORG_DEFAULT,
			label: `${m["library.org_default"]()}${orgDomainLabel ? ` (${orgDomainLabel})` : ""}`,
		},
		...AMAZON_DOMAINS.map((d) => ({ value: d.value, label: d.label })),
	];
	const draft = toDraft(state);
	const handleSave = () => {
		if (library.uuid) updateMutation.mutate({ uuid: library.uuid, ...draft });
	};

	const disabled = !canManage || updateMutation.isPending;
	const discard = () => {
		change(initial);
		setEditorVersion((version) => version + 1);
	};
	const toggleProvider = (id: MetadataProviderId, enabled: boolean) => {
		const active = toProviderIds(availableProviders);
		if (!enabled && active.length === 1) return;
		change({
			providers: providers.map((entry) =>
				entry.id === id ? { ...entry, enabled } : entry,
			),
		});
	};
	const updateProviders = (next: ProviderEntry[]) => {
		const toggled = next.find(
			(entry) =>
				entry.enabled !==
				providers.find((provider) => provider.id === entry.id)?.enabled,
		);
		if (toggled) toggleProvider(toggled.id, toggled.enabled);
		else change({ providers: next });
	};
	const providerControls = isAudiobook
		? {
				audible: (
					<div className="flex flex-col gap-2">
						<Label htmlFor="library-audible-region">
							{m["library.audible_region"]()}
						</Label>
						<Select
							value={audibleRegion}
							onValueChange={(value) => change({ audibleRegion: value })}
							disabled={disabled}
							items={audibleItems}
						>
							<SelectTrigger
								id="library-audible-region"
								className="w-full sm:w-72"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{AUDIBLE_REGIONS.map((region) => (
										<SelectItem key={region.value} value={region.value}>
											{region.label}
											{region.value === DEFAULT_AUDIBLE_REGION
												? ` — ${m["library.default_suffix"]()}`
												: ""}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{m["library.audible_region_hint"]()}
						</p>
					</div>
				),
			}
		: {
				amazon: (
					<div className="flex flex-col gap-2">
						<Label htmlFor="library-amazon-store">
							{m["library.amazon_store"]()}
						</Label>
						<Select
							value={amazonDomain}
							onValueChange={(value) => change({ amazonDomain: value })}
							disabled={disabled}
							items={amazonItems}
						>
							<SelectTrigger
								id="library-amazon-store"
								className="w-full sm:w-72"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={ORG_DEFAULT}>
										{m["library.org_default"]()}
										{orgDomainLabel ? ` (${orgDomainLabel})` : ""}
									</SelectItem>
									{AMAZON_DOMAINS.map((domain) => (
										<SelectItem key={domain.value} value={domain.value}>
											{domain.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{m["library.amazon_store_hint"]()}
						</p>
					</div>
				),
			};
	const fieldRouting = (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-base text-foreground">
					{m["library.field_routing_title"]()}
				</h3>
			</div>
			<FieldRoutingEditor
				key={editorVersion}
				pausedFields={pruneRules(pausedFields)}
				onPausedFieldsChange={(value) => change({ pausedFields: value })}
				mediaType={library.mediaType}
				order={toProviderIds(availableProviders)}
				value={pruneRules(fieldRules)}
				updates={fieldUpdates}
				onChange={(value) => change({ fieldRules: value })}
				onUpdatesChange={(value) => change({ fieldUpdates: value })}
				disabled={disabled}
			/>
		</section>
	);

	return (
		<div className="flex flex-col gap-6">
			<MetadataDraftRegistration
				key={JSON.stringify(availability)}
				draft={draft}
				onDraftChange={onDraftChange}
			/>
			<section className="flex flex-col gap-5">
				<div className="flex min-w-0 flex-col gap-1">
					<h3
						ref={headingRef}
						tabIndex={headingRef ? -1 : undefined}
						className="font-medium text-base text-foreground outline-none"
					>
						{m["library.sources_priority_title"]()}
					</h3>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{m["library.sources_order_hint"]()}
				</p>
				<ProviderPriorityList
					value={availableProviders}
					onChange={updateProviders}
					disabled={disabled}
					providerControls={providerControls}
				/>
				<Separator className="bg-border/60" />
				{fieldRouting}
			</section>

			{!onDraftChange && canManage && changed && (
				<section
					className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xl motion-safe:animate-in"
					aria-label={m["library.rules_unsaved"]()}
				>
					<p className="flex-1 font-medium text-sm" role="status">
						{m["library.rules_unsaved"]()}
					</p>
					<Button variant="ghost" disabled={disabled} onClick={discard}>
						{m["library.rules_discard"]()}
					</Button>
					<Button
						size="sm"
						disabled={
							!changed ||
							updateMutation.isPending ||
							toProviderIds(availableProviders).length === 0
						}
						onClick={handleSave}
					>
						{updateMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<FloppyDisk data-icon="inline-start" />
						)}
						{m["settings.profile.save_changes"]()}
					</Button>
				</section>
			)}
		</div>
	);
}

function MetadataDraftRegistration({
	draft,
	onDraftChange,
}: {
	draft: MetadataDraft;
	onDraftChange?: (draft: MetadataDraft) => void;
}) {
	useMountEffect(() => onDraftChange?.(draft));
	return null;
}
