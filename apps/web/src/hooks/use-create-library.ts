import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

/** Creating a library is triggered from two places (settings and the rail's
 *  create menu); they share the invalidation and the toast so the two can't
 *  drift. `onCreated` is where the caller closes its own wizard. */
export function useCreateLibrary({
	onCreated,
}: {
	onCreated?: () => void;
} = {}) {
	return useMutation({
		...orpc.libraries.createLibrary.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibrariesOverview.queryOptions().queryKey,
			});
			onCreated?.();
			toast.success(m["toast.library_created"]());
		},
		onError: (err) => toast.error(err.message),
	});
}
