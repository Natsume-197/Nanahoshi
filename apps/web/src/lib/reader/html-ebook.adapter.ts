import type {
	EbookDocument,
	HtmlContent,
	HtmlNavigationItem,
} from "@nanahoshi-v2/ebook-parser";
import { classifyContentForm } from "./content-form";
import { formatStyleSheet } from "./format-style-sheet";
import { recountBookData } from "./recount-book-data";
import { sanitizeStoredBookHtml } from "./sanitize-html";
import {
	BOOK_CONTENT_FORM_VERSION,
	BOOK_COUNT_VERSION,
	BOOK_SANITIZE_VERSION,
	type ReaderBookData,
	type ReaderSourceFormat,
	type Section,
} from "./types";

const RESOURCE_HREF =
	/(?:ebook-resource:|kindle:(?:embed|flow):)[^\s"'()<>]+/gi;
const SECTION_HREF = /^ebook-section:([^#?]+)(?:#(.*))?$/i;

export async function adaptHtmlEbook(
	ebook: EbookDocument,
	uuid: string,
	fallbackTitle: string,
	document: Document,
): Promise<ReaderBookData> {
	try {
		if (ebook.content.kind !== "html") {
			throw new Error(
				`Reader content is not implemented: ${ebook.content.kind}`,
			);
		}

		const sourceFormat = ebook.format as ReaderSourceFormat;
		const content = ebook.content;
		const blobs: Record<string, Blob> = {};
		const keyByHref = new Map<string, string>();
		const dataUrlCache = new Map<string, Promise<string>>();
		let nextResource = 0;

		const cachedDataUrl = (nestedHref: string): Promise<string> => {
			const canonical = canonicalizeResourceHref(nestedHref);
			let cached = dataUrlCache.get(canonical);
			if (!cached) {
				cached = resourceToDataUrl(content, nestedHref);
				dataUrlCache.set(canonical, cached);
			}
			return cached;
		};

		const persistResource = async (href: string): Promise<string> => {
			const canonicalHref = canonicalizeResourceHref(href);
			const existing = keyByHref.get(canonicalHref);
			if (existing !== undefined) return existing;

			let parsed: Awaited<ReturnType<typeof content.openResource>>;
			try {
				parsed = await content.openResource(canonicalHref);
			} catch {
				keyByHref.set(canonicalHref, "");
				return "";
			}
			if (!parsed) {
				keyByHref.set(canonicalHref, "");
				return "";
			}
			let resource = new Blob([Uint8Array.from(parsed.data)], {
				type: parsed.mediaType,
			});
			const key = `${sourceFormat}/resource-${nextResource++}${extensionFor(parsed.mediaType)}`;
			keyByHref.set(canonicalHref, key);

			if (parsed.mediaType === "image/svg+xml") {
				const svgText = await resource.text();
				if (looksLikeSvg(svgText)) {
					let svg = await replaceResourceHrefs(svgText, cachedDataUrl);
					svg = fixSvgPercentageDimensions(svg);
					resource = new Blob([svg], { type: parsed.mediaType });
				}
			}

			blobs[key] = resource;
			return key;
		};

		const root = document.createElement("div");
		const sections: Section[] = [];
		const labels = tocLabelsBySection(content.toc);
		const styles = new Set<string>();
		let bodyTextLength = 0;
		let imageCount = 0;

		for (const sectionRef of content.sections) {
			const section = await content.openSection(sectionRef.id);
			if (!section) continue;
			const resolveHref = async (href: string) => {
				const key = await persistResource(href);
				return key ? `ttu:${key}` : href;
			};
			const html = await replaceResourceHrefs(section.html, resolveHref);
			for (const css of section.styles) {
				styles.add(await replaceResourceHrefs(css, resolveHref));
			}

			const body = document.createElement("div");
			body.className = ["ttu-book-body-wrapper", section.bodyClass]
				.filter(Boolean)
				.join(" ");
			if (section.bodyId) body.id = section.bodyId;
			body.innerHTML = html;
			rewriteInternalLinks(body, sourceFormat);
			removeUnpackedMedia(body);
			const sectionTextLength =
				body.textContent?.replace(/\s+/gu, "").length ?? 0;
			const sectionImageCount = body.querySelectorAll("img, svg image").length;
			bodyTextLength += sectionTextLength;
			imageCount += sectionImageCount;
			if (sectionTextLength === 0 && sectionImageCount > 0) {
				body.classList.add("ttu-no-text");
			}

			const htmlWrapper = document.createElement("div");
			htmlWrapper.className = ["ttu-book-html-wrapper", section.htmlClass]
				.filter(Boolean)
				.join(" ");
			if (sectionTextLength === 0 && sectionImageCount > 0) {
				htmlWrapper.classList.add("ttu-no-text");
			}
			htmlWrapper.appendChild(body);

			const wrapper = document.createElement("div");
			wrapper.id = sectionReference(sourceFormat, sectionRef.id);
			wrapper.appendChild(htmlWrapper);
			root.appendChild(wrapper);
			sections.push({
				reference: wrapper.id,
				charactersWeight: 1,
				label: labels.get(sectionRef.id),
			});
		}

		const cover = await ebook.openCover();
		if (cover) {
			const coverSize = cover.data.length;
			const alreadyPresent = Object.values(blobs).some(
				(b) => b.size === coverSize,
			);
			if (!alreadyPresent) {
				const coverKey = `${sourceFormat}/resource-${nextResource++}${extensionFor(cover.mediaType)}`;
				blobs[coverKey] = new Blob([Uint8Array.from(cover.data)], {
					type: cover.mediaType,
				});

				const body = document.createElement("div");
				body.className = "ttu-book-body-wrapper ttu-no-text";
				body.innerHTML = `<img src="ttu:${coverKey}">`;

				const htmlWrapper = document.createElement("div");
				htmlWrapper.className = "ttu-book-html-wrapper ttu-no-text";
				htmlWrapper.appendChild(body);

				const wrapper = document.createElement("div");
				wrapper.id = sectionReference(sourceFormat, "cover");
				wrapper.appendChild(htmlWrapper);
				root.insertBefore(wrapper, root.firstChild);
				imageCount++;
				sections.unshift({ reference: wrapper.id, charactersWeight: 0 });
			}
		}

		const presentation = ebook.metadata.presentation;

		const base: ReaderBookData = {
			uuid,
			sourceFormat,
			contentForm: classifyContentForm({
				presentation,
				sectionCount: sections.length,
				textLength: bodyTextLength,
				imageCount,
			}),
			contentFormVersion: BOOK_CONTENT_FORM_VERSION,
			presentation,
			title: ebook.metadata.title.trim() || fallbackTitle,
			language: normalizeLanguage(ebook.metadata.language) || "ja",
			elementHtml: sanitizeStoredBookHtml(root).innerHTML,
			styleSheet: formatStyleSheet([...styles].join("\n"), ".book-content"),
			blobs,
			characters: 0,
			sections,
			storedAt: Date.now(),
			countVersion: BOOK_COUNT_VERSION,
			sanitizeVersion: BOOK_SANITIZE_VERSION,
		};

		return recountBookData(base, document);
	} finally {
		await ebook.close();
	}
}

function canonicalizeResourceHref(href: string): string {
	const match = href.match(/^kindle:(embed|flow):([^?]+)(?:\?mime=(.+))?$/i);
	if (!match?.[1] || !match[2]) return href;
	const mediaType = match[3] ? `?type=${encodeURIComponent(match[3])}` : "";
	return `ebook-resource:${match[1].toLowerCase()}:${match[2]}${mediaType}`;
}

function tocLabelsBySection(
	items: readonly HtmlNavigationItem[],
): Map<string, string> {
	const labels = new Map<string, string>();
	const visit = (entries: readonly HtmlNavigationItem[]) => {
		for (const item of entries) {
			if (item.target && !labels.has(item.target.sectionId)) {
				labels.set(item.target.sectionId, item.label.trim());
			}
			if (item.children) visit(item.children);
		}
	};
	visit(items);
	return labels;
}

function rewriteInternalLinks(
	container: HTMLElement,
	format: ReaderSourceFormat,
) {
	for (const anchor of container.querySelectorAll("a[href]")) {
		const href = anchor.getAttribute("href");
		const match = href?.match(SECTION_HREF);
		if (!match?.[1]) continue;
		const id = safeDecode(match[1]);
		anchor.setAttribute(
			"href",
			match[2] ? `#${match[2]}` : `#${sectionReference(format, id)}`,
		);
	}
}

function removeUnpackedMedia(container: HTMLElement) {
	for (const element of container.querySelectorAll(
		"img,image,video,audio,source",
	)) {
		const attributes =
			element.tagName.toLowerCase() === "image"
				? element.getAttributeNames().filter((name) => name.endsWith("href"))
				: ["src", "poster"];
		for (const attribute of attributes) {
			const value = element.getAttribute(attribute);
			if (value && !value.startsWith("ttu:") && !value.startsWith("data:")) {
				element.setAttribute(`data-ttu-${attribute}`, value);
				element.removeAttribute(attribute);
			}
		}
	}
}

async function replaceResourceHrefs(
	input: string | Promise<string>,
	replace: (href: string) => Promise<string>,
): Promise<string> {
	const value = await input;
	const hrefs = [...new Set(value.match(RESOURCE_HREF) ?? [])];
	const replacements = await Promise.all(
		hrefs.map(async (href) => [href, await replace(href)] as const),
	);
	let output = value;
	for (const [href, replacement] of replacements) {
		output = output.replaceAll(href, replacement);
	}
	return output;
}

async function resourceToDataUrl(
	content: HtmlContent,
	href: string,
): Promise<string> {
	const canonicalHref = canonicalizeResourceHref(href);
	let resource: Awaited<ReturnType<typeof content.openResource>>;
	try {
		resource = await content.openResource(canonicalHref);
	} catch {
		return "";
	}
	if (!resource) return "";
	return blobToDataUrl(
		new Blob([Uint8Array.from(resource.data)], { type: resource.mediaType }),
	);
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

function sectionReference(format: ReaderSourceFormat, id: string): string {
	return `ttu-${format}-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function normalizeLanguage(value: string): string {
	const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
	return /^[a-z]{2,8}$/.test(primary) ? primary : "";
}

function extensionFor(mediaType: string): string {
	return (
		{
			"image/jpeg": ".jpg",
			"image/png": ".png",
			"image/gif": ".gif",
			"image/webp": ".webp",
			"image/svg+xml": ".svg",
			"font/ttf": ".ttf",
			"font/otf": ".otf",
			"font/woff": ".woff",
			"font/woff2": ".woff2",
			"audio/mpeg": ".mp3",
			"audio/ogg": ".ogg",
			"video/mp4": ".mp4",
			"video/webm": ".webm",
		}[mediaType] ?? ""
	);
}

function fixSvgPercentageDimensions(svg: string): string {
	const viewBox = svg.match(/viewBox=["'](\d+)\s+(\d+)\s+(\d+)\s+(\d+)["']/);
	if (!viewBox?.[3] || !viewBox[4]) return svg;
	const w = viewBox[3];
	const h = viewBox[4];
	return svg
		.replace(/(<svg\b[^>]*)\bwidth=["']100%["']/, `$1width="${w}"`)
		.replace(/(<svg\b[^>]*)\bheight=["']100%["']/, `$1height="${h}"`);
}

function looksLikeSvg(text: string): boolean {
	const trimmed = text.trimStart();
	const start = trimmed.startsWith("<?xml")
		? trimmed.slice(trimmed.indexOf("?>") + 2).trimStart()
		: trimmed;
	return start.startsWith("<svg");
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
