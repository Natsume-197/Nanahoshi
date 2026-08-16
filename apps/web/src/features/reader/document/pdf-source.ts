import type { Section } from "@/features/reader/document/types";

export interface PdfReaderSource {
	url: string;
	name: string;
	previewUrl?: string;
}

export function createPdfSections(pageCount: number): Section[] {
	return Array.from(
		{ length: Math.max(1, Math.floor(pageCount)) },
		(_, index) => ({
			reference: `pdf-page-${index + 1}`,
			label: `Page ${index + 1}`,
			charactersWeight: 1,
			startCharacter: index + 1,
			characters: 1,
		}),
	);
}
