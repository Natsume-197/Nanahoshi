import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

/** Every creation surface shares cache invalidation and completion feedback. */
export function useCreateLibrary({
	onCreated,
}: {
	onCreated?: () => void;
} = {}) {
	return useMutation({
		...orpc.libraries.createLibrary.mutationOptions(),
		onSuccess: (created) => {
			posthog?.capture("library_created");
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.key(),
			});
			onCreated?.();
			if (created.initialScanStatus === "failed")
				toast.warning(m["toast.library_created_scan_failed"]());
			else toast.success(m["toast.library_created"]());
		},
	});
}
