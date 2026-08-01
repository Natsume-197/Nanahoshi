/** Builds an attachment header with an ASCII fallback and an RFC 5987 name. */
export function attachmentContentDisposition(filename: string): string {
	const fallback =
		filename
			.normalize("NFKD")
			.replace(/[^\x20-\x7e]/g, "")
			.replace(/["\\]/g, "_")
			.trim() || "download";
	const encoded = encodeURIComponent(filename).replace(
		/['()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
