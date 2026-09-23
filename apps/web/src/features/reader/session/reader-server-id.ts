/**
 * The server that authorizes and serves this reading session: the book's own
 * server when it was opened cross-server, else the active one. On a hard load
 * the auth org store is still fetching; the session already names the same
 * server, so the download need not wait for that round trip.
 */
export function resolveReaderServerId({
	switchedOrgId,
	activeOrgId,
	activeOrgPending,
	sessionServerId,
}: {
	switchedOrgId: string | null | undefined;
	activeOrgId: string | null | undefined;
	activeOrgPending: boolean;
	sessionServerId: string | null | undefined;
}): string | null {
	if (switchedOrgId) return switchedOrgId;
	if (activeOrgId) return activeOrgId;
	return activeOrgPending ? (sessionServerId ?? null) : null;
}
