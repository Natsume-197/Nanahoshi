/**
 * Starts a browser-managed attachment download without opening a new tab.
 * The response's Content-Disposition remains authoritative for the filename.
 */
export function downloadFromUrl(url: string, filename?: string): void {
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename ?? "";
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
}
