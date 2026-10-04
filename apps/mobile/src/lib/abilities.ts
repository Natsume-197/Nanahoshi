import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/providers/app-provider";

/** The web's useAbilities `can()`: UI gating only, the server re-checks. */
function useAbilities() {
	const { orpc } = useApi();
	return useQuery({
		...orpc.users.getMyAbilities.queryOptions(),
		staleTime: 5 * 60_000,
	}).data;
}

export function useCan() {
	const data = useAbilities();
	return (resource: string, action: string) => {
		if (!data) return false;
		if (data.isAppOwner || data.isOrgOwner || data.hasAdministrator)
			return true;
		const actions = (data.globalPerms as Record<string, string[]>)[resource];
		return actions ? actions.includes(action) : false;
	};
}

/** Instance owner: the only one who can make servers (admin.createServer). */
export function useIsAppOwner() {
	return useAbilities()?.isAppOwner === true;
}
