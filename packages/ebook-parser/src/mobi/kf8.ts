import {
	concatBytes,
	type MobiContainer,
	readString,
	readUint,
} from "./binary";
import { type NcxItem, readIndexData, readNcx } from "./index-data";
import { parseResourceHref, resourceHref, withMediaType } from "./resources";
import type {
	MobiResolvedHref,
	MobiResource,
	MobiSection,
	MobiSectionReference,
	MobiSource,
	MobiTocItem,
} from "./types";

interface Skeleton {
	index: number;
	fragmentCount: number;
	offset: number;
	length: number;
}

interface Fragment {
	insertOffset: number;
	selector: string;
	index: number;
	offset: number;
	length: number;
}

interface Kf8SectionReference extends MobiSectionReference {
	skeleton: Skeleton;
	fragments: Fragment[];
	length: number;
}

const KINDLE_RESOURCE =
	/kindle:(flow|embed):(\w+)(?:\?mime=(\w+\/[-+.\w]+))?/gi;
const KINDLE_POSITION = /kindle:pos:fid:(\w+):off:(\w+)/i;

export class Kf8Source implements MobiSource {
	readonly format = "azw3" as const;
	readonly metadata;
	readonly sections: readonly Kf8SectionReference[];
	readonly toc: readonly MobiTocItem[];
	private readonly container: MobiContainer;
	private readonly flowTable: [number, number][];
	private readonly fullRawLength: number;
	private readonly sectionById = new Map<string, Kf8SectionReference>();
	private readonly fragmentSelectors = new Map<number, Map<number, string>>();
	private head: Uint8Array = new Uint8Array();
	private tail: Uint8Array = new Uint8Array();
	private lastHeadRecord = -1;
	private lastTailRecord = -1;

	constructor(container: MobiContainer) {
		const header = container.kf8;
		if (!header) throw new Error("Missing KF8 header");
		this.container = container;
		this.metadata = container.getMetadata();
		const fdst = container.loadRecord(header.fdst);
		if (readString(fdst, 0, 4) !== "FDST")
			throw new Error("Missing FDST record");
		const entryCount = readUint(fdst, 8, 4);
		this.flowTable = Array.from({ length: entryCount }, (_, index) => [
			readUint(fdst, 12 + index * 8, 4),
			readUint(fdst, 16 + index * 8, 4),
		]);
		this.fullRawLength = this.flowTable.at(-1)?.[1] ?? 0;

		const skeletonData = readIndexData(header.skel, (index) =>
			container.loadRecord(index),
		);
		const skeletons: Skeleton[] = skeletonData.table.map(({ tags }, index) => ({
			index,
			fragmentCount: required(tags[1], 0, "KF8 skeleton fragment count"),
			offset: required(tags[6], 0, "KF8 skeleton offset"),
			length: required(tags[6], 1, "KF8 skeleton length"),
		}));
		const fragmentData = readIndexData(header.frag, (index) =>
			container.loadRecord(index),
		);
		const fragments: Fragment[] = fragmentData.table.map(({ name, tags }) => ({
			insertOffset: Number.parseInt(name, 10),
			selector:
				fragmentData.strings[required(tags[2], 0, "KF8 fragment selector")] ??
				"",
			index: required(tags[4], 0, "KF8 fragment index"),
			offset: required(tags[6], 0, "KF8 fragment offset"),
			length: required(tags[6], 1, "KF8 fragment length"),
		}));

		let fragmentStart = 0;
		this.sections = skeletons.map((skeleton, index) => {
			const sectionFragments = fragments.slice(
				fragmentStart,
				fragmentStart + skeleton.fragmentCount,
			);
			fragmentStart += skeleton.fragmentCount;
			const section = {
				id: String(index),
				skeleton,
				fragments: sectionFragments,
				length:
					skeleton.length +
					sectionFragments.reduce((sum, fragment) => sum + fragment.length, 0),
			};
			this.sectionById.set(section.id, section);
			return section;
		});

		this.toc = this.readToc();
	}

	loadSection(id: string): MobiSection | undefined {
		const section = this.sectionById.get(id);
		if (!section) return undefined;
		const text = this.loadText(section);
		const head = text.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
		const body = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? text;
		const styles = [
			...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
		].map((match) => this.canonicalizeResources(match[1] ?? ""));
		for (const link of head.match(/<link\b[^>]*>/gi) ?? []) {
			const href = attribute(link, "href");
			if (!href) continue;
			const canonical = this.canonicalizeResources(href);
			const resource = this.loadResource(canonical);
			if (resource)
				styles.push(
					this.canonicalizeResources(this.container.decode(resource.data)),
				);
		}
		return { html: this.canonicalizeResources(body), styles };
	}

	loadResource(href: string): MobiResource | undefined {
		const parsed = parseResourceHref(href);
		if (!parsed) return undefined;
		try {
			if (parsed.kind === "embed") {
				const index = Number.parseInt(parsed.id, 36) - 1;
				if (index < 0) return undefined;
				return withMediaType(
					this.container.loadResource(index),
					parsed.mediaType,
				);
			}
			const index = Number.parseInt(parsed.id, 10);
			const range = this.flowTable[index];
			if (!range) return undefined;
			return {
				data: this.loadRaw(range[0], range[1]),
				mediaType: parsed.mediaType ?? "application/octet-stream",
			};
		} catch {
			return undefined;
		}
	}

	getCover(): MobiResource | undefined {
		return this.container.getCover();
	}

	resolveHref(href: string): MobiResolvedHref | undefined {
		if (/^(?!kindle)\w+:/i.test(href)) return undefined;
		const match = href.match(KINDLE_POSITION);
		if (!match?.[1] || !match[2]) return undefined;
		const fragmentId = Number.parseInt(match[1], 32);
		const offset = Number.parseInt(match[2], 32);
		const section = this.sections.find((candidate) =>
			candidate.fragments.some((fragment) => fragment.index === fragmentId),
		);
		if (!section) return undefined;
		const cached = this.fragmentSelectors.get(fragmentId)?.get(offset);
		if (cached !== undefined) return { id: section.id, selector: cached };
		const fragment = section.fragments.find(
			(candidate) => candidate.index === fragmentId,
		);
		if (!fragment) return { id: section.id, selector: "" };
		const start =
			section.skeleton.offset + section.skeleton.length + fragment.offset;
		const raw = this.loadRaw(start, start + fragment.length);
		const selector = fragmentSelector(this.container.decode(raw).slice(offset));
		this.cacheSelector(fragmentId, offset, selector);
		return { id: section.id, selector };
	}

	private readToc(): MobiTocItem[] {
		if (this.container.mobi.indx >= 0xffff_ffff) return [];
		try {
			return readNcx(this.container.mobi.indx, (index) =>
				this.container.loadRecord(index),
			).map(mapNcx);
		} catch {
			return [];
		}
	}

	private loadText(section: Kf8SectionReference): string {
		const { skeleton, fragments, length } = section;
		const raw = this.loadRaw(skeleton.offset, skeleton.offset + length);
		let output: Uint8Array<ArrayBufferLike> = raw.slice(0, skeleton.length);
		for (const fragment of fragments) {
			const insertOffset = fragment.insertOffset - skeleton.offset;
			const sourceOffset = skeleton.length + fragment.offset;
			const fragmentBytes = raw.slice(
				sourceOffset,
				sourceOffset + fragment.length,
			);
			output = concatBytes([
				output.slice(0, insertOffset),
				fragmentBytes,
				output.slice(insertOffset),
			]);
		}
		return this.container.decode(output);
	}

	private loadRaw(start: number, end: number): Uint8Array {
		const headDistance = end - this.head.length;
		const tailDistance = this.fullRawLength
			? this.fullRawLength - this.tail.length - start
			: Number.POSITIVE_INFINITY;
		if (headDistance < 0 || headDistance < tailDistance) {
			while (this.head.length < end)
				this.head = concatBytes([
					this.head,
					this.container.loadTextRecord(++this.lastHeadRecord),
				]);
			return this.head.slice(start, end);
		}
		while (this.fullRawLength - this.tail.length > start) {
			const index =
				this.container.palmDoc.numTextRecords - 1 - ++this.lastTailRecord;
			this.tail = concatBytes([
				this.container.loadTextRecord(index),
				this.tail,
			]);
		}
		const tailStart = this.fullRawLength - this.tail.length;
		return this.tail.slice(start - tailStart, end - tailStart);
	}

	private canonicalizeResources(value: string): string {
		return value.replace(
			KINDLE_RESOURCE,
			(_match, kind: string, id: string, mediaType?: string) =>
				resourceHref(
					kind.toLowerCase() === "flow" ? "flow" : "embed",
					id,
					mediaType,
				),
		);
	}

	private cacheSelector(fragment: number, offset: number, selector: string) {
		let offsets = this.fragmentSelectors.get(fragment);
		if (!offsets) {
			offsets = new Map();
			this.fragmentSelectors.set(fragment, offsets);
		}
		offsets.set(offset, selector);
	}
}

function required(
	values: number[] | undefined,
	index: number,
	label: string,
): number {
	const value = values?.[index];
	if (value === undefined) throw new Error(`Missing ${label}`);
	return value;
}

function mapNcx(item: NcxItem): MobiTocItem {
	const [fragment = 0, offset = 0] = item.position ?? [];
	return {
		label: item.label,
		href: positionHref(fragment, offset),
		children: item.children?.map(mapNcx),
	};
}

function positionHref(fragment: number, offset: number): string {
	return `kindle:pos:fid:${fragment.toString(32).toUpperCase().padStart(4, "0")}:off:${offset.toString(32).toUpperCase().padStart(10, "0")}`;
}

function fragmentSelector(value: string): string {
	const match = value.match(/\s(id|name|aid)\s*=\s*['"]([^'"]*)['"]/i);
	if (!match?.[1] || !match[2]) return "";
	return `[${match[1]}="${cssEscape(match[2])}"]`;
}

function cssEscape(value: string): string {
	return value.replace(/[\\"]/g, "\\$&");
}

function attribute(tag: string, name: string): string | undefined {
	return tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
}
