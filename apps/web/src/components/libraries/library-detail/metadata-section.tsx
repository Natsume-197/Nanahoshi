import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
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
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

export function MetadataSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		toProviderEntries(library.metadataProviders),
	);
	// Re-sync provider state if the library data changes (e.g. after refetch).
	const prevProvidersRef = useRef(library.metadataProviders);
	if (library.metadataProviders !== prevProvidersRef.current) {
		prevProvidersRef.current = library.metadataProviders;
		setProviders(toProviderEntries(library.metadataProviders));
	}

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success("Metadata providers updated");
		},
		onError: (err) => toast.error(err.message),
	});

	const savedEntries = toProviderEntries(library.metadataProviders);
	const changed = JSON.stringify(providers) !== JSON.stringify(savedEntries);

	if (library.mediaType === "audiobook") {
		return (
			<p className="text-muted-foreground text-sm">
				Audiobook metadata is matched against Audible automatically; there are
				no configurable providers yet.
			</p>
		);
	}

	return (
		<div className="space-y-3">
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
						onClick={() =>
							updateMutation.mutate({
								id: library.id,
								metadataProviders: toProviderIds(providers),
							})
						}
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
				disabled={!canManage || updateMutation.isPending}
			/>
		</div>
	);
}
