import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { CaretDown, CircleNotch, FloppyDisk } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	FieldRoutingEditor,
	type FieldRules,
} from "@/components/libraries/field-routing-editor";
import {
	type ProviderEntry,
	ProviderPriorityList,
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
	const [showAdvanced, setShowAdvanced] = useState(
		() => Object.keys(fieldRulesOf(library.metadataProviders)).length > 0,
	);
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
		setAmazonDomain(library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT);
		setAudibleRegion(
			library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION,
		);
	}

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
	const changed =
		JSON.stringify(providers) !== JSON.stringify(savedEntries) ||
		JSON.stringify(fieldRules) !== JSON.stringify(savedFieldRules) ||
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

	// Drop empty rule arrays (a field toggled on then fully unchecked) so they
	// don't persist as a "leave this field empty" instruction by accident.
	const cleanedRules: FieldRules = Object.fromEntries(
		Object.entries(fieldRules).filter(([, ids]) => ids.length > 0),
	);
	const hasRules = Object.keys(cleanedRules).length > 0;
	const handleSave = () =>
		updateMutation.mutate({
			uuid: library.uuid,
			metadataProviders: hasRules
				? { order: toProviderIds(providers), fields: cleanedRules }
				: toProviderIds(providers),
			metadataConfig: isAudiobook
				? { audible: { region: audibleRegion } }
				: amazonDomain !== ORG_DEFAULT
					? { amazon: { domain: amazonDomain } }
					: {},
		});

	const disabled = !canManage || updateMutation.isPending;

	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-5">
				<div className="flex min-w-0 flex-col gap-1">
					<h3 className="font-medium text-base text-foreground">
						{m["library.providers"]()}
					</h3>
					<p className="text-muted-foreground text-sm">
						{m["library.providers_hint"]()}
					</p>
				</div>
				<ProviderPriorityList
					value={providers}
					onChange={setProviders}
					disabled={disabled}
				/>
			</section>

			<Separator className="bg-border/60" />
			<section className="flex flex-col gap-4">
				<button
					type="button"
					onClick={() => setShowAdvanced((v) => !v)}
					className="flex items-center justify-between gap-2 text-left"
				>
					<div className="flex min-w-0 flex-col gap-1">
						<h3 className="font-medium text-base text-foreground">
							{m["library.field_routing_title"]()}
						</h3>
						<p className="text-muted-foreground text-sm">
							{m["library.field_routing_hint"]()}
						</p>
					</div>
					<CaretDown
						className={`size-5 shrink-0 text-muted-foreground transition-transform ${
							showAdvanced ? "rotate-180" : ""
						}`}
					/>
				</button>
				{showAdvanced && (
					<FieldRoutingEditor
						mediaType={library.mediaType}
						order={toProviderIds(providers)}
						value={fieldRules}
						onChange={setFieldRules}
						disabled={disabled}
					/>
				)}
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

			{canManage && (
				<div className="flex justify-end">
					<Button
						size="sm"
						disabled={!changed || updateMutation.isPending}
						onClick={handleSave}
					>
						{updateMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<FloppyDisk data-icon="inline-start" />
						)}
						{m["settings.profile.save_changes"]()}
					</Button>
				</div>
			)}
		</div>
	);
}
