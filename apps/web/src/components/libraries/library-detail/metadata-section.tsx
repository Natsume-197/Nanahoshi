import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { CircleNotch, FloppyDisk } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AMAZON_DOMAINS } from "@/lib/amazon-domains";
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION } from "@/lib/audible-regions";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

// Sentinel for "inherit the organization's default Amazon store".
const ORG_DEFAULT = "__default__";

export function MetadataSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const isAudiobook = library.mediaType === "audiobook";
	const savedDomain = library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT;
	const savedRegion =
		library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION;

	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		toProviderEntries(library.mediaType, library.metadataProviders),
	);
	const [amazonDomain, setAmazonDomain] = useState(savedDomain);
	const [audibleRegion, setAudibleRegion] = useState(savedRegion);

	// Re-sync local state if the library data changes (e.g. after refetch).
	const prevRef = useRef(library);
	if (library !== prevRef.current) {
		prevRef.current = library;
		setProviders(
			toProviderEntries(library.mediaType, library.metadataProviders),
		);
		setAmazonDomain(library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT);
		setAudibleRegion(
			library.metadataConfig?.audible?.region ?? DEFAULT_AUDIBLE_REGION,
		);
	}

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success("Metadata settings updated");
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
		library.metadataProviders,
	);
	const changed =
		JSON.stringify(providers) !== JSON.stringify(savedEntries) ||
		(isAudiobook
			? audibleRegion !== savedRegion
			: amazonDomain !== savedDomain);

	const handleSave = () =>
		updateMutation.mutate({
			uuid: library.uuid,
			metadataProviders: toProviderIds(providers),
			metadataConfig: isAudiobook
				? { audible: { region: audibleRegion } }
				: amazonDomain !== ORG_DEFAULT
					? { amazon: { domain: amazonDomain } }
					: {},
		});

	const disabled = !canManage || updateMutation.isPending;

	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h3 className="font-medium text-sm">Metadata providers</h3>
					<p className="text-muted-foreground text-xs">
						Toggle providers and drag priority order — the first match wins for
						each field.
					</p>
				</div>
				{canManage && changed && (
					<Button
						size="sm"
						disabled={updateMutation.isPending}
						onClick={handleSave}
					>
						{updateMutation.isPending ? (
							<CircleNotch className="mr-1.5 size-3.5 animate-spin" />
						) : (
							<FloppyDisk className="mr-1.5 size-3.5" />
						)}
						FloppyDisk
					</Button>
				)}
			</div>

			<ProviderPriorityList
				value={providers}
				onChange={setProviders}
				disabled={disabled}
			/>

			{isAudiobook ? (
				<div className="space-y-2">
					<Label className="text-xs">Audible region</Label>
					<Select
						value={audibleRegion}
						onValueChange={setAudibleRegion}
						disabled={disabled}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{AUDIBLE_REGIONS.map((r) => (
								<SelectItem key={r.value} value={r.value}>
									{r.label}
									{r.value === DEFAULT_AUDIBLE_REGION ? " — default" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Catalog used to match audiobooks — pick the store matching this
						library's language.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					<Label className="text-xs">Amazon store</Label>
					<Select
						value={amazonDomain}
						onValueChange={setAmazonDomain}
						disabled={disabled}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ORG_DEFAULT}>
								Use organization default
								{orgDomainLabel ? ` (${orgDomainLabel})` : ""}
							</SelectItem>
							{AMAZON_DOMAINS.map((d) => (
								<SelectItem key={d.value} value={d.value}>
									{d.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Pick the regional store matching this library's language; inherits
						the organization default when unset.
					</p>
				</div>
			)}
		</div>
	);
}
