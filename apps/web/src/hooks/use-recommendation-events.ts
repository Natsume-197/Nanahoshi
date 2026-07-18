import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

/**
 * Refetch the recommendation queries when the server pushes "your feed was
 * recomputed" — the debounced refresh-user job creates no task, so without
 * this push the dashboard only picks up the fresh feed on staleTime expiry.
 */
export function useRecommendationEvents() {
	useGatewayChannel("recs", () => {
		queryClient.invalidateQueries({ queryKey: orpc.recommendations.key() });
	});
}
