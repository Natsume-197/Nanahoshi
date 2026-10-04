/** The phone app's own link for an invite; it needs the API origin, since
 * the app connects to that and not to the web page. */
export function inviteAppLink(invite: {
	server: string;
	code: string;
	link: string;
}) {
	return `nanahoshi://invite?${new URLSearchParams(invite)}`;
}

export function isPhoneBrowser(userAgent: string) {
	return /Android|iPhone|iPad|iPod/i.test(userAgent);
}
