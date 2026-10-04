const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	"#39": "'",
};

/** Descriptions arrive as provider HTML (the web sanitises and renders it);
 * on the phone they are shown as plain paragraphs. */
export function htmlToText(html: string | null | undefined): string {
	if (!html) return "";
	return html
		.replace(/<\s*br\s*\/?>/gi, "\n")
		.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&(#?\w+);/g, (whole, name: string) => {
			if (name in ENTITIES) return ENTITIES[name];
			if (name.startsWith("#")) {
				const code =
					name[1] === "x"
						? Number.parseInt(name.slice(2), 16)
						: Number(name.slice(1));
				return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
			}
			return whole;
		})
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
