import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/providers/app-provider";

/** The web's useAbilities `can()`: UI gating only, the server re-checks. */
export function useCan() {
	const { orpc } = useApi();
	const { data } = useQuery({
		...orpc.users.getMyAbilities.queryOptions(),
		staleTime: 5 * 60_000,
	});
	return (resource: string, action: string) => {
		if (!data) return false;
		if (data.isAppOwner || data.isOrgOwner || data.hasAdministrator)
			return true;
		const actions = (data.globalPerms as Record<string, string[]>)[resource];
		return actions ? actions.includes(action) : false;
	};
}
