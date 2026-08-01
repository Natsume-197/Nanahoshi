type SessionAuthClient = {
	revokeSessions: () => Promise<unknown>;
	signOut: () => Promise<unknown>;
};

/** Revoke every server session before clearing the current browser cookies. */
export async function revokeAllSessionsAndSignOut(client: SessionAuthClient) {
	await client.revokeSessions();
	await client.signOut();
}
