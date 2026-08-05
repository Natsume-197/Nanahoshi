/**
 * Whether a publication is delivered as flowing text or as a sequence of page
 * images. A manga, art book or catalogue shares its title and its original
 * author with the novel it adapts, so no amount of title or author comparison
 * separates them — only what the file actually contains does.
 */
export type ContentForm = "text" | "images";

/** What the package says about itself, readable from the OPF alone. */
export type ContentFormDeclaration = {
	/** Package-level `rendition:layout`. */
	layout?: string | null;
	/** Package-level `rendition:spread`. */
	spread?: string | null;
	/** A fixed-layout page-resolution meta is declared on the package. */
	declaresPageResolution?: boolean;
};

/** What the file was measured to hold. Reading may sample rather than exhaust. */
export type ContentFormSample = {
	/** Characters of body text across the documents actually read. */
	textLength: number;
	/** Documents actually read — a sample, not necessarily the whole spine. */
	sampledDocuments: number;
	/** Images and content documents listed in the manifest. */
	imageCount: number;
	documentCount: number;
};

/**
 * Text is judged per page, not in total. A page-image book runs to hundreds of
 * pages, so an afterword or a colophon that would blow an absolute budget still
 * averages near nothing; measured over a 353-book library, page-image books
 * held 0.5–6.7 characters per page, the sparsest text book 303, and ordinary
 * prose 1,370 and up. This sits an order of magnitude clear of both sides, and
 * leaves a 170-page volume room for some 17,000 characters of real text.
 */
const MAX_CHARS_PER_PAGE = 100;

/** A page-image book stores one image per content document. */
const MIN_IMAGES_PER_DOCUMENT = 0.9;

/**
 * Text past which the per-page average can no longer fall under the threshold,
 * so a reader may stop early: nothing further it could count changes the answer.
 */
export function contentFormTextBudget(plannedDocuments: number): number {
	return MAX_CHARS_PER_PAGE * Math.max(plannedDocuments, 1);
}

/**
 * Non-whitespace body characters in an HTML document: drop the head and every
 * tag, then count what prose is left. A regex strip rather than a DOM parse —
 * the measurement is coarse and runs once per sampled page across formats, so
 * building a document tree per page is cost the classification never needs.
 */
export function htmlBodyTextLength(document: string): number {
	return document
		.replace(/<head[\s\S]*?<\/head>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/gu, "").length;
}

/** Count of `<img>` and SVG `<image>` elements in an HTML document. */
export function htmlImageCount(document: string): number {
	return document.match(/<(?:img|image)[\s/>]/gi)?.length ?? 0;
}

/**
 * The answer from the declaration alone, or null when the package does not say.
 *
 * `pre-paginated` needs one of the fixed-layout comic markers beside it, since
 * a novel may also be laid out to fixed pages. Those markers ship from the same
 * publisher template, so they are one signal rather than two, and they fail
 * together on files built by other tooling — which is what the measured form is
 * for. A package that declares itself reflowable is taken at its word: flowing
 * layout is the opposite of what a comic needs, so the claim is a strong one.
 */
export function contentFormFromDeclaration(
	declaration: ContentFormDeclaration,
): ContentForm | null {
	const layout = declaration.layout?.trim().toLowerCase();
	if (layout === "reflowable") return "text";
	if (layout !== "pre-paginated") return null;
	const marked =
		declaration.spread?.trim().toLowerCase() === "landscape" ||
		declaration.declaresPageResolution === true;
	return marked ? "images" : null;
}

/**
 * The file itself: no body text to speak of, and an image behind every page.
 * Answers for the packages that declare nothing, roughly a third of a library.
 */
function sampleIsPageImages(sample: ContentFormSample): boolean {
	const { textLength, sampledDocuments, imageCount, documentCount } = sample;
	if (sampledDocuments <= 0 || documentCount <= 0) return false;
	if (textLength / sampledDocuments >= MAX_CHARS_PER_PAGE) return false;
	return imageCount / documentCount >= MIN_IMAGES_PER_DOCUMENT;
}

/**
 * A declaration wins outright; otherwise the measured form decides. With
 * neither, the answer is `text` — an unmeasurable book keeps reaching every
 * provider, so a parsing gap can never quietly strip a library of its metadata.
 */
export function resolveContentForm(
	declaration: ContentFormDeclaration,
	sample?: ContentFormSample | null,
): ContentForm {
	const declared = contentFormFromDeclaration(declaration);
	if (declared) return declared;
	return sample && sampleIsPageImages(sample) ? "images" : "text";
}
