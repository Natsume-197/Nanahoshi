import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	type ManualPresenceStatus,
	resolvePresenceStatus,
	withPresenceStatus,
} from "@/components/shared/presence-status";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

/**
 * The user's manual presence status plus an optimistic setter. Shared by the
 * desktop user menu and the mobile account drawer so the two can't drift.
 */
export function usePresenceStatus() {
	const profileOptions = orpc.profile.getProfile.queryOptions();
	const { data: profile } = useQuery(profileOptions);
	// Exact query key (not the partial .key() matcher) so setQueryData hits the
	// same cache entry the useQuery above — and the navbar avatar — read from.
	const key = profileOptions.queryKey;

	const mutation = useMutation({
		mutationFn: (next: ManualPresenceStatus) =>
			client.presence.setStatus({ status: next }),
		// Optimistic: flip the cached status (and the navbar dot) on click, before
		// the server round-trip — presenceStatus is exactly the value we send. Roll
		// back to the snapshot if the request fails.
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData(key);
			queryClient.setQueryData(key, (old) => withPresenceStatus(old, next));
			return { previous };
		},
		onError: (_err, _next, context) => {
			queryClient.setQueryData(key, context?.previous);
			toast.error(m["toast.status_update_failed"]());
		},
	});

	return {
		status: resolvePresenceStatus(profile),
		setStatus: mutation.mutate,
	};
}
