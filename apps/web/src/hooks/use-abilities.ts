import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/** UI gating only — the server always re-checks. Never trust this for security. */
export function useAbilities() {
	const { data: org } = authClient.useActiveOrganization();
	const { data, isPending } = useQuery({
		...orpc.users.getMyAbilities.queryOptions(),
		enabled: !!org,
	});

	const isPrivileged =
		!!data && (data.isAppOwner || data.isOrgOwner || data.hasAdministrator);

	function can(resource: string, action: string): boolean {
		if (!data) return false;
		if (isPrivileged) return true;
		const actions = (data.globalPerms as Record<string, string[]>)[resource];
		return actions ? actions.includes(action) : false;
	}

	function canViewLibrary(libraryId: number): boolean {
		if (!data) return false;
		if (data.accessibleLibraryIds === "ALL") return true;
		return data.accessibleLibraryIds.includes(libraryId);
	}

	return {
		abilities: data,
		isLoading: isPending,
		isOrgOwner: data?.isOrgOwner ?? false,
		isAppOwner: data?.isAppOwner ?? false,
		hasAdministrator: data?.hasAdministrator ?? false,
		highestPosition: data?.highestPosition ?? 0,
		roleIds: data?.roleIds ?? [],
		ssoEnabled: data?.ssoEnabled ?? false,
		can,
		canViewLibrary,
	};
}
