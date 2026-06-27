/** Source of truth for every permission. Roles and overwrites store subsets of it. */
export const PERMISSIONS = {
	organization: ["administrator", "update", "transferOwnership", "delete"],
	member: ["list", "invite", "remove", "assignRoles"],
	invitation: ["create", "revoke"],
	roles: ["manage"],
	settings: ["read", "update"],
	sso: ["manage"],
	library: [
		"view",
		"create",
		"update",
		"delete",
		"scan",
		"managePaths",
		"manageProviders",
		"manageAccess",
		"upload",
	],
	book: ["read", "download", "editMetadata", "delete", "bulkEdit"],
	cover: ["edit"],
	collection: ["read", "create", "update", "delete", "makePublic"],
	progress: ["read", "write"],
	like: ["create"],
	apiKey: ["create", "revoke"],
	opds: ["access"],
} as const;

export type Resource = keyof typeof PERMISSIONS;

/** Loose on purpose so DB jsonb rows assign without casts; validated at runtime by permissionMapSchema. */
export type PermissionMap = Record<string, string[]>;

export function permMapHas(
	map: PermissionMap | null | undefined,
	resource: Resource,
	action: string,
): boolean {
	if (!map) return false;
	const actions = map[resource];
	return actions ? actions.includes(action) : false;
}

/** Union of several permission maps (used to fold a user's roles into global perms). */
export function unionPermMaps(maps: PermissionMap[]): PermissionMap {
	const out: Record<string, Set<string>> = {};
	for (const map of maps) {
		for (const [resource, actions] of Object.entries(map)) {
			if (!actions) continue;
			out[resource] ??= new Set();
			for (const a of actions) out[resource].add(a);
		}
	}
	const result: PermissionMap = {};
	for (const [resource, set] of Object.entries(out)) {
		result[resource] = [...set];
	}
	return result;
}
