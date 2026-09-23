import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	normalizeRailLibraryLayout,
	RAIL_LIBRARY_LAYOUT_KEY,
	type RailLibraryLayout,
} from "@/lib/rail-library-layout";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const layoutQuery = orpc.userSettings.get.queryOptions({
	input: { key: RAIL_LIBRARY_LAYOUT_KEY },
});

/** Order and pins for the rail's Colecciones list. Writes are optimistic and
 *  last-write-wins: a reorder is not worth a cross-device conflict dialog. */
export function useRailLibraryLayout(): {
	layout: RailLibraryLayout;
	isLoading: boolean;
	save: (next: RailLibraryLayout) => void;
} {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		...layoutQuery,
		staleTime: 5 * 60_000,
		select: (row) => normalizeRailLibraryLayout(row?.value),
	});

	const mutation = useMutation({
		...orpc.userSettings.set.mutationOptions(),
		onError: () => {
			void queryClient.invalidateQueries({ queryKey: layoutQuery.queryKey });
			toast.error(m["collection.order_save_failed"]());
		},
	});

	const save = (next: RailLibraryLayout) => {
		void queryClient.cancelQueries({ queryKey: layoutQuery.queryKey });
		queryClient.setQueryData(layoutQuery.queryKey, (old) => ({
			...old,
			value: next,
			updatedAt: new Date(),
		}));
		mutation.mutate({ key: RAIL_LIBRARY_LAYOUT_KEY, value: next });
	};

	return {
		layout: data ?? normalizeRailLibraryLayout(null),
		isLoading,
		save,
	};
}
