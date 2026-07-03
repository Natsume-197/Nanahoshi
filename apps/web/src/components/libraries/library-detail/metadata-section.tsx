import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
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
	const savedDomain = library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT;

	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		toProviderEntries(library.metadataProviders),
	);
	const [amazonDomain, setAmazonDomain] = useState(savedDomain);

	// Re-sync local state if the library data changes (e.g. after refetch).
	const prevRef = useRef(library);
	if (library !== prevRef.current) {
		prevRef.current = library;
		setProviders(toProviderEntries(library.metadataProviders));
		setAmazonDomain(library.metadataConfig?.amazon?.domain ?? ORG_DEFAULT);
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
	const { data: orgAmazon } = useQuery(orpc.settings.getAmazon.queryOptions());
	const orgDomainLabel = AMAZON_DOMAINS.find(
		(d) => d.value === orgAmazon?.domain,
	)?.label;

	const savedEntries = toProviderEntries(library.metadataProviders);
	const changed =
		JSON.stringify(providers) !== JSON.stringify(savedEntries) ||
		amazonDomain !== savedDomain;

	if (library.mediaType === "audiobook") {
		return (
			<p className="text-muted-foreground text-sm">
				Audiobook metadata is matched against Audible automatically; there are
				no configurable providers yet.
			</p>
		);
	}

	const handleSave = () =>
		updateMutation.mutate({
			uuid: library.uuid,
			metadataProviders: toProviderIds(providers),
			metadataConfig:
				amazonDomain !== ORG_DEFAULT
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
							<Loader2 className="mr-1.5 size-3.5 animate-spin" />
						) : (
							<Save className="mr-1.5 size-3.5" />
						)}
						Save
					</Button>
				)}
			</div>

			<ProviderPriorityList
				value={providers}
				onChange={setProviders}
				disabled={disabled}
			/>

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
					Pick the regional store matching this library's language; inherits the
					organization default when unset.
				</p>
			</div>
		</div>
	);
}
