/** Case- and accent-blind, so "aparien" finds "Apariencia". */
export function foldText(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The sections whose rows' labels hold the query, each down to those rows;
 * a section left with none goes. An empty query keeps everything. */
export function filterSections<
	Row extends { label: string },
	Section extends { rows: Row[] },
>(sections: Section[], query: string): Section[] {
	const needle = foldText(query);
	if (!needle) return sections;
	return sections
		.map((section) => ({
			...section,
			rows: section.rows.filter((row) => foldText(row.label).includes(needle)),
		}))
		.filter((section) => section.rows.length > 0);
}
