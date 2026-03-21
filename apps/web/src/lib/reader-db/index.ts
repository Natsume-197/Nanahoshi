import Dexie, { type Table } from "dexie";
import type {
	Bookmark,
	NavigationItem,
	Section,
	SourceImage,
} from "@/lib/epub/types";

export type ReaderSourceRecord = {
	localId: number;
	kind: string;
	uniqueId: string;
	title: string;
	creator: string;
	language: string;
	totalChars: number;
	currChars: number;
	currParagraph: number;
	bookmarks: Bookmark[];
	nav: NavigationItem[];
	sections: Section[];
	images: SourceImage[];
	css: string;
	createdAt: string;
	updatedAt: string;
};

export type ReaderSourceLightRecord = {
	localId: number;
	kind: string;
	uniqueId: string;
	title: string;
	creator: string;
	language: string;
	totalChars: number;
	currChars: number;
	currParagraph: number;
	bookmarks: Bookmark[];
	coverImage?: SourceImage;
	createdAt: string;
	updatedAt: string;
};

const DB_NAME = "NanahoshiReaderDB";
const DB_VERSION = 1;

class ReaderDatabase extends Dexie {
	readerSources!: Table<ReaderSourceRecord, number>;
	readerLightSources!: Table<ReaderSourceLightRecord, number>;

	constructor() {
		super(DB_NAME);

		this.version(DB_VERSION).stores({
			readerSources: "++localId,&uniqueId",
			readerLightSources: "++localId,&uniqueId",
		});
	}

	async saveBookRecord(
		source: ReaderSourceRecord,
		updateAt = true,
	): Promise<void> {
		if (updateAt) source.updatedAt = new Date().toISOString();

		const lightRecord: Partial<ReaderSourceLightRecord> = {
			kind: source.kind,
			title: source.title,
			uniqueId: source.uniqueId,
			language: source.language,
			creator: source.creator,
			bookmarks: source.bookmarks,
			coverImage: source.images[0],
			updatedAt: source.updatedAt,
			createdAt: source.createdAt,
			totalChars: source.totalChars,
			currChars: source.currChars,
			currParagraph: source.currParagraph,
		};
		if (source.localId) lightRecord.localId = source.localId;

		const existing = await this.readerLightSources.get({
			uniqueId: source.uniqueId,
		});

		await this.transaction(
			"rw",
			this.readerSources,
			this.readerLightSources,
			async () => {
				let localId = source.localId;
				if (!localId) {
					if (existing) return;
					localId = await this.readerSources.add(source);
					lightRecord.localId = localId;
					await this.readerLightSources.add(
						lightRecord as ReaderSourceLightRecord,
					);
					source.localId = localId;
				} else {
					await Promise.all([
						this.readerSources.put(source),
						this.readerLightSources.put(lightRecord as ReaderSourceLightRecord),
					]);
				}
			},
		);
	}

	async deleteBookById(localId: number) {
		await this.transaction(
			"rw",
			this.readerSources,
			this.readerLightSources,
			async () => {
				await this.readerSources.delete(localId);
				await this.readerLightSources.delete(localId);
			},
		);
	}

	getBookById(localId: number) {
		return this.readerSources.get(localId);
	}

	getBookByUniqueId(uniqueId: string) {
		return this.readerSources.get({ uniqueId });
	}
}

export const readerDb = new ReaderDatabase();
