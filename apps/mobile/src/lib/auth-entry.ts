let connectedJustNow = false;

/** Picking a server remounts the navigation onto the welcome screen; this
 * carries the person straight on to signing in to it. */
export function markServerConnected() {
	connectedJustNow = true;
}

export function serverJustConnected(): boolean {
	return connectedJustNow;
}

export function takeServerConnected(): boolean {
	const value = connectedJustNow;
	connectedJustNow = false;
	return value;
}
