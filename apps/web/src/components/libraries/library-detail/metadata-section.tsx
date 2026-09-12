import {
	type BookMetadataProfileId,
	bookMetadataProfile,
	isBookMetadataProfileId,
} from "@nanahoshi-v2/api/modules/metadataProfiles";
import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { CircleNotch, FloppyDisk } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	defaultFieldUpdates,
	FieldRoutingEditor,
	type FieldRules,
	type FieldUpdates,
} from "@/components/libraries/field-routing-editor";
import {
	type MetadataProviderId,
	PROVIDER_INFO,
	type ProviderEntry,
	toProviderEntries,
	toProviderIds,
} from "@/components/libraries/provider-priority-list";
import { SettingControlRow } from "@/components/settings/setting-rows";
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
import { Switch } from "@/components/ui/switch";
import { AMAZON_DOMAINS } from "@/lib/amazon-domains";
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION } from "@/lib/audible-regions";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

// Sentinel for "inherit the organization's default Amazon store".
const ORG_DEFAULT = "__default__";

// metadata_providers holds either the legacy ordered array or the routed
// { order, fields } shape; this section edits the order and must not drop
// any per-field rules configured elsewhere.
type ProvidersConfig = LibraryComplete["metadataProviders"];
type ProfileChoice = BookMetadataProfileId | "custom";
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
const profileOf = (config: ProvidersConfig): ProfileChoice => {
	if (Array.isArray(config)) return "custom";
	const id = config.profile?.id;
	return id && isBookMetadataProfileId(id) ? id : "custom";
};
const primaryOf = (
	config: ProvidersConfig,
	profile: ProfileChoice,
): MetadataProviderId | undefined => {
	if (profile === "custom") return undefined;
	if (!Array.isArray(config) && config.primary) {
		return config.primary as MetadataProviderId;
	}
	return bookMetadataProfile(profile).primary;
};

export function MetadataSection({
	library,
	canManage,
	onDirtyChange,
}: {
	library: LibraryComplete;
	canManage: boolean;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const isAudiobook = library.mediaType === "audiobook";
	const savedDomain = library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT;
	const savedRegion =
		library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION;

	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		toProviderEntries(library.mediaType, orderOf(library.metadataProviders)),
	);
	const [fieldRules, setFieldRules] = useState<FieldRules>(() =>
		fieldRulesOf(library.metadataProviders),
	);
	const [profile, setProfile] = useState<ProfileChoice>(() =>
		profileOf(library.metadataProviders),
	);
	const [fieldUpdates, setFieldUpdates] = useState<FieldUpdates>(() =>
		updatesOf(library.metadataProviders, library.mediaType),
	);
	const [pausedFields, setPausedFields] = useState<FieldRules>(() =>
		pausedOf(library.metadataProviders),
	);
	const [editorVersion, setEditorVersion] = useState(0);
	const [amazonDomain, setAmazonDomain] = useState(savedDomain);
	const [audibleRegion, setAudibleRegion] = useState(savedRegion);

	// Re-sync local state if the library data changes (e.g. after refetch).
	const prevRef = useRef(library);
	if (library !== prevRef.current) {
		prevRef.current = library;
		setProviders(
			toProviderEntries(library.mediaType, orderOf(library.metadataProviders)),
		);
		setFieldRules(fieldRulesOf(library.metadataProviders));
		setFieldUpdates(updatesOf(library.metadataProviders, library.mediaType));
		setProfile(profileOf(library.metadataProviders));
		setPausedFields(pausedOf(library.metadataProviders));
		setEditorVersion((version) => version + 1);
		setAmazonDomain(library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT);
		setAudibleRegion(
			library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION,
		);
	}

	// Derived, not synced: the authority is whatever the chosen profile declares,
	// except while the saved profile is still selected — then the saved config's
	// explicit primary wins (a failing provider may have been swapped out of it).
	const primaryProvider =
		profile === "custom"
			? undefined
			: profile === profileOf(library.metadataProviders)
				? primaryOf(library.metadataProviders, profile)
				: bookMetadataProfile(profile).primary;

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
	const orgDomainLabel = AMAZON_DOMAINS.find(
		(d) => d.value === orgAmazon?.domain,
	)?.label;

	const savedEntries = toProviderEntries(
		library.mediaType,
		orderOf(library.metadataProviders),
	);
	const savedFieldRules = fieldRulesOf(library.metadataProviders);
	const savedProfile = profileOf(library.metadataProviders);
	const changed =
		JSON.stringify(providers) !== JSON.stringify(savedEntries) ||
		JSON.stringify(fieldRules) !== JSON.stringify(savedFieldRules) ||
		JSON.stringify(fieldUpdates) !==
			JSON.stringify(updatesOf(library.metadataProviders, library.mediaType)) ||
		JSON.stringify(pausedFields) !==
			JSON.stringify(pausedOf(library.metadataProviders)) ||
		profile !== savedProfile ||
		(isAudiobook
			? audibleRegion !== savedRegion
			: amazonDomain !== savedDomain);

	useEffect(() => {
		onDirtyChange?.(changed);
		return () => onDirtyChange?.(false);
	}, [changed, onDirtyChange]);

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
	const profileItems = [
		{ value: "general", label: m["library.metadata_profile_general"]() },
		{
			value: "light_novels",
			label: m["library.metadata_profile_light_novels"](),
		},
		{ value: "custom", label: m["library.metadata_profile_custom"]() },
	];

	const handleProfileChange = (value: ProfileChoice) => {
		setProfile(value);
		setEditorVersion((version) => version + 1);
		if (value === "custom") {
			return;
		}
		setPausedFields({});
		const preset = bookMetadataProfile(value);
		setProviders(toProviderEntries("ebook", [...preset.order]));
		setFieldRules(
			Object.fromEntries(
				Object.entries(preset.fields ?? {}).flatMap(([field, ids]) =>
					ids ? [[field, [...ids]]] : [],
				),
			) as FieldRules,
		);
		setFieldUpdates(defaultFieldUpdates(library.mediaType));
	};

	const cleanedRules = fieldRules;
	const hasRules =
		Object.keys(fieldRules).length > 0 || Object.keys(fieldUpdates).length > 0;
	const defaults =
		!isAudiobook && profile !== "custom"
			? (bookMetadataProfile(profile).fields as FieldRules)
			: {};
	const handleSave = () =>
		updateMutation.mutate({
			uuid: library.uuid,
			metadataProviders:
				!isAudiobook && profile !== "custom" && primaryProvider
					? {
							order: toProviderIds(providers),
							...(hasRules && { fields: cleanedRules }),
							updates: fieldUpdates,
							pausedFields,
							primary: primaryProvider,
							profile: {
								id: profile,
								version: bookMetadataProfile(profile).profile.version,
							},
						}
					: hasRules
						? {
								order: toProviderIds(providers),
								fields: cleanedRules,
								updates: fieldUpdates,
								pausedFields,
							}
						: toProviderIds(providers),
			metadataConfig: isAudiobook
				? { audible: { region: audibleRegion } }
				: amazonDomain !== ORG_DEFAULT
					? { amazon: { domain: amazonDomain } }
					: {},
		});

	const disabled = !canManage || updateMutation.isPending;
	const discard = () => {
		setProviders(
			toProviderEntries(library.mediaType, orderOf(library.metadataProviders)),
		);
		setFieldRules(fieldRulesOf(library.metadataProviders));
		setFieldUpdates(updatesOf(library.metadataProviders, library.mediaType));
		setPausedFields(pausedOf(library.metadataProviders));
		setProfile(savedProfile);
		setAmazonDomain(savedDomain);
		setAudibleRegion(savedRegion);
		setEditorVersion((version) => version + 1);
	};
	const toggleProvider = (id: MetadataProviderId, enabled: boolean) => {
		const active = toProviderIds(providers);
		if (!enabled && (id === primaryProvider || active.length === 1)) return;
		// Preserve displayed per-field priority before changing provider availability.
		setFieldRules({
			...fieldRules,
			...(Object.fromEntries(
				Object.keys(defaultFieldUpdates(library.mediaType)).map((field) => [
					field,
					[...(fieldRules[field] ?? active)],
				]),
			) as FieldRules),
		});
		setProviders(
			providers.map((entry) =>
				entry.id === id ? { ...entry, enabled } : entry,
			),
		);
	};

	return (
		<div className="flex flex-col gap-6">
			{!isAudiobook && (
				<section className="flex flex-col">
					<SettingControlRow
						label={
							<Label
								htmlFor="library-metadata-profile"
								className="font-medium text-base text-foreground"
							>
								{m["library.metadata_profile"]()}
							</Label>
						}
						description={m["library.metadata_profile_hint"]()}
					>
						<Select
							value={profile}
							onValueChange={handleProfileChange}
							disabled={disabled}
							items={profileItems}
						>
							<SelectTrigger
								id="library-metadata-profile"
								className="w-full sm:w-72"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{profileItems.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</SettingControlRow>
				</section>
			)}

			{!isAudiobook && <Separator className="bg-border/60" />}

			<section className="flex flex-col gap-5">
				<div className="flex min-w-0 flex-col gap-1">
					<h3 className="font-medium text-base text-foreground">
						{m["library.rules_available"]()}
					</h3>
					<p className="text-muted-foreground text-sm">
						{m["library.rules_available_help"]()}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{providers.map((entry) => (
						<label
							htmlFor={`available-provider-${entry.id}`}
							key={entry.id}
							title={PROVIDER_INFO[entry.id].description()}
							className={cn(
								"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
								entry.enabled
									? "border-primary/30 bg-primary/5"
									: "border-border text-muted-foreground",
							)}
						>
							<Switch
								id={`available-provider-${entry.id}`}
								checked={entry.enabled}
								disabled={
									disabled ||
									entry.id === primaryProvider ||
									(entry.enabled && toProviderIds(providers).length === 1)
								}
								aria-label={m["library.provider_enable"]({
									name: PROVIDER_INFO[entry.id].label,
								})}
								onCheckedChange={(checked) => toggleProvider(entry.id, checked)}
							/>
							{PROVIDER_INFO[entry.id].label}
						</label>
					))}
				</div>
			</section>

			<Separator className="bg-border/60" />
			<section className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h3 className="font-medium text-base text-foreground">
						{m["library.field_routing_title"]()}
					</h3>
					<p className="text-muted-foreground text-sm">
						{m["library.field_routing_hint"]()}
					</p>
				</div>
				<FieldRoutingEditor
					key={editorVersion}
					pausedFields={pausedFields}
					onPausedFieldsChange={setPausedFields}
					mediaType={library.mediaType}
					order={toProviderIds(providers)}
					value={fieldRules}
					updates={fieldUpdates}
					onChange={setFieldRules}
					onUpdatesChange={setFieldUpdates}
					defaults={defaults}
					disabled={disabled}
				/>
			</section>

			<Separator className="bg-border/60" />
			<section className="flex flex-col">
				<div>
					{isAudiobook ? (
						<SettingControlRow
							label={
								<Label
									htmlFor="library-audible-region"
									className="font-medium text-base text-foreground"
								>
									{m["library.audible_region"]()}
								</Label>
							}
							description={m["library.audible_region_hint"]()}
						>
							<Select
								value={audibleRegion}
								onValueChange={setAudibleRegion}
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
										{AUDIBLE_REGIONS.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												{r.label}
												{r.value === DEFAULT_AUDIBLE_REGION
													? ` — ${m["library.default_suffix"]()}`
													: ""}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</SettingControlRow>
					) : (
						<SettingControlRow
							label={
								<Label
									htmlFor="library-amazon-store"
									className="font-medium text-base text-foreground"
								>
									{m["library.amazon_store"]()}
								</Label>
							}
							description={m["library.amazon_store_hint"]()}
						>
							<Select
								value={amazonDomain}
								onValueChange={setAmazonDomain}
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
										{AMAZON_DOMAINS.map((d) => (
											<SelectItem key={d.value} value={d.value}>
												{d.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</SettingControlRow>
					)}
				</div>
			</section>

			{canManage && changed && (
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
							toProviderIds(providers).length === 0
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
