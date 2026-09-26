export interface PdfPageImage {
	width: number;
	height: number;
	close(): void;
}

/** One PDFium instance. It renders a single page at a time. */
export interface PdfRenderLane<Image extends PdfPageImage = PdfPageImage> {
	render(pageIndex: number, scale: number): Promise<Image>;
}

interface PageImages<Image> {
	preview?: Image;
	full?: { scale: number; image: Image };
}

interface Job {
	pageIndex: number;
	kind: "preview" | "full";
	scale: number;
	priority: number;
}

export interface PdfPageImageStoreOptions {
	/** Device pixels per PDF point for the quick low-resolution pass. */
	previewScale: (pageIndex: number) => number;
	/** Full renders of pages that left the viewport stay cached up to this size. */
	fullBudgetBytes?: number;
	previewBudgetBytes?: number;
}

const DEFAULT_FULL_BUDGET_BYTES = 192 * 1024 * 1024;
const DEFAULT_PREVIEW_BUDGET_BYTES = 48 * 1024 * 1024;

const imageBytes = (image: PdfPageImage) => image.width * image.height * 4;

/**
 * Schedules PDF page renders across PDFium lanes and caches the results.
 *
 * Visible pages first get a cheap preview and a full render (on separate
 * lanes when available); neighbours are prefetched nearest-first. Started
 * renders are never cancelled: PDFium cannot stop mid-page, and the result is
 * cached for when the reader scrolls back.
 */
export class PdfPageImageStore<Image extends PdfPageImage = PdfPageImage> {
	private readonly lanes: PdfRenderLane<Image>[] = [];
	private readonly busyLanes = new Map<PdfRenderLane<Image>, string>();
	private readonly requests = new Map<number, { scale: number }>();
	private readonly visible = new Set<number>();
	private readonly images = new Map<number, PageImages<Image>>();
	private readonly inFlight = new Set<string>();
	private readonly listeners = new Map<number, Set<() => void>>();
	// Insertion order doubles as least-recently-used order.
	private readonly fullLru = new Set<number>();
	private readonly previewLru = new Set<number>();
	private generation = 0;
	private held = false;

	constructor(private readonly options: PdfPageImageStoreOptions) {}

	/** Returns the callback that retires the lane. */
	addLane(lane: PdfRenderLane<Image>): () => void {
		this.lanes.push(lane);
		this.pump();
		return () => {
			const index = this.lanes.indexOf(lane);
			if (index >= 0) this.lanes.splice(index, 1);
			// A destroyed worker never settles its job; let another lane take it.
			const key = this.busyLanes.get(lane);
			if (key) this.inFlight.delete(key);
			this.busyLanes.delete(lane);
			this.pump();
		};
	}

	/** Pauses scheduling (lanes keep warming up) until `release` is called. */
	hold(): () => void {
		this.held = true;
		return () => {
			this.held = false;
			this.pump();
		};
	}

	/** Registers a mounted page. Returns the release callback for unmount. */
	request(pageIndex: number, scale: number): () => void {
		const request = { scale };
		this.requests.set(pageIndex, request);
		this.touch(pageIndex);
		this.pump();
		return () => {
			if (this.requests.get(pageIndex) !== request) return;
			this.requests.delete(pageIndex);
			this.evict();
		};
	}

	setVisible(pageIndex: number, visible: boolean) {
		if (this.visible.has(pageIndex) === visible) return;
		if (visible) this.visible.add(pageIndex);
		else this.visible.delete(pageIndex);
		this.pump();
	}

	/** The sharpest image available for a page, even if it is not at the requested scale. */
	best(pageIndex: number): Image | undefined {
		const entry = this.images.get(pageIndex);
		return entry?.full?.image ?? entry?.preview;
	}

	subscribe(pageIndex: number, listener: () => void): () => void {
		let set = this.listeners.get(pageIndex);
		if (!set) {
			set = new Set();
			this.listeners.set(pageIndex, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
			if (set.size === 0) this.listeners.delete(pageIndex);
		};
	}

	/** Releases every cached bitmap. Late results from running renders are dropped. */
	clear() {
		this.generation += 1;
		for (const entry of this.images.values()) {
			entry.preview?.close();
			entry.full?.image.close();
		}
		this.images.clear();
		this.fullLru.clear();
		this.previewLru.clear();
	}

	private nextJob(): Job | undefined {
		const visiblePages = [...this.visible].filter((page) =>
			this.requests.has(page),
		);
		let best: Job | undefined;
		const consider = (job: Job) => {
			if (this.inFlight.has(jobKey(job))) return;
			if (!best || job.priority < best.priority) best = job;
		};
		for (const [pageIndex, request] of this.requests) {
			const entry = this.images.get(pageIndex);
			if (entry?.full?.scale === request.scale) continue;
			const distance = visiblePages.length
				? Math.min(...visiblePages.map((page) => Math.abs(page - pageIndex)))
				: pageIndex;
			const visible = this.visible.has(pageIndex);
			const previewScale = this.options.previewScale(pageIndex);
			if (
				visible &&
				!entry &&
				previewScale < request.scale &&
				!this.inFlight.has(
					jobKey({ pageIndex, kind: "full", scale: request.scale }),
				)
			) {
				consider({
					pageIndex,
					kind: "preview",
					scale: previewScale,
					priority: 0,
				});
			}
			consider({
				pageIndex,
				kind: "full",
				scale: request.scale,
				priority: visible ? 1 : 2 + distance,
			});
		}
		return best;
	}

	private pump() {
		if (this.held) return;
		for (const lane of this.lanes) {
			if (this.busyLanes.has(lane)) continue;
			const job = this.nextJob();
			if (!job) return;
			this.run(lane, job);
		}
	}

	private run(lane: PdfRenderLane<Image>, job: Job) {
		const key = jobKey(job);
		const generation = this.generation;
		this.busyLanes.set(lane, key);
		this.inFlight.add(key);
		lane
			.render(job.pageIndex, job.scale)
			.then(
				(image) => {
					if (generation === this.generation) this.store(job, image);
					else image.close();
				},
				() => {},
			)
			.finally(() => {
				if (this.busyLanes.get(lane) !== key) return;
				this.busyLanes.delete(lane);
				this.inFlight.delete(key);
				this.pump();
			});
	}

	private store(job: Job, image: Image) {
		const entry = this.images.get(job.pageIndex) ?? {};
		if (job.kind === "preview") {
			if (entry.preview) {
				image.close();
				return;
			}
			entry.preview = image;
		} else {
			const requested = this.requests.get(job.pageIndex)?.scale;
			// Keep whichever full render matches the current zoom.
			if (entry.full && entry.full.scale === requested) {
				image.close();
				return;
			}
			entry.full?.image.close();
			entry.full = { scale: job.scale, image };
		}
		this.images.set(job.pageIndex, entry);
		this.touch(job.pageIndex);
		this.evict();
		for (const listener of this.listeners.get(job.pageIndex) ?? []) listener();
	}

	private touch(pageIndex: number) {
		const entry = this.images.get(pageIndex);
		if (entry?.full) {
			this.fullLru.delete(pageIndex);
			this.fullLru.add(pageIndex);
		}
		if (entry?.preview) {
			this.previewLru.delete(pageIndex);
			this.previewLru.add(pageIndex);
		}
	}

	private evict() {
		const fullBudget =
			this.options.fullBudgetBytes ?? DEFAULT_FULL_BUDGET_BYTES;
		const previewBudget =
			this.options.previewBudgetBytes ?? DEFAULT_PREVIEW_BUDGET_BYTES;
		let fullBytes = 0;
		let previewBytes = 0;
		for (const entry of this.images.values()) {
			if (entry.full) fullBytes += imageBytes(entry.full.image);
			if (entry.preview) previewBytes += imageBytes(entry.preview);
		}
		for (const pageIndex of [...this.fullLru]) {
			if (fullBytes <= fullBudget) break;
			if (this.requests.has(pageIndex)) continue;
			const entry = this.images.get(pageIndex);
			this.fullLru.delete(pageIndex);
			if (!entry?.full) continue;
			fullBytes -= imageBytes(entry.full.image);
			entry.full.image.close();
			entry.full = undefined;
			this.dropIfEmpty(pageIndex, entry);
		}
		for (const pageIndex of [...this.previewLru]) {
			if (previewBytes <= previewBudget) break;
			if (this.requests.has(pageIndex)) continue;
			const entry = this.images.get(pageIndex);
			this.previewLru.delete(pageIndex);
			if (!entry?.preview) continue;
			previewBytes -= imageBytes(entry.preview);
			entry.preview.close();
			entry.preview = undefined;
			this.dropIfEmpty(pageIndex, entry);
		}
	}

	private dropIfEmpty(pageIndex: number, entry: PageImages<Image>) {
		if (!entry.full && !entry.preview) this.images.delete(pageIndex);
	}
}

function jobKey(job: Pick<Job, "pageIndex" | "kind" | "scale">) {
	return `${job.pageIndex}:${job.kind}:${job.scale}`;
}
