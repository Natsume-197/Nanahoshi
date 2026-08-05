import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";

// file.service reaches the DB only through repository singletons; mocking the
// Drizzle client as {} guarantees any unpatched repository call blows up with
// a TypeError instead of silently hitting a database.

// Deterministic fs: paths in `existingPaths` exist, everything else doesn't.
// (Other test files mock node:fs/promises without restoring, so relying on the
// real fs here is not an option.)
const existingPaths = new Set<string>();
const priorFs = await import("node:fs/promises");
mock.module("node:fs/promises", () => ({
	...priorFs,
	default: {
		...priorFs.default,
		access: (p: string) =>
			existingPaths.has(p)
				? Promise.resolve()
				: Promise.reject(new Error(`ENOENT: ${p}`)),
		stat: (p: string) =>
			existingPaths.has(p)
				? Promise.resolve({ size: 42 })
				: Promise.reject(new Error(`ENOENT: ${p}`)),
	},
}));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		SERVER_URL: "http://localhost:3000",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "mock@example.com",
		SMTP_PASS: "mock",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const service = await import("../file.service");
const { fileRepository } = await import("../file.repository");
const { audiobookRepository } = await import(
	"../../audiobooks/audiobook.repository"
);
const { audiobookMetadataRepository } = await import(
	"../../audiobooks/metadata/metadata.repository"
);

// ─── Singleton patching (restored after each test; mock.module leaks) ────────

const originals = {
	findBookByUuid: fileRepository.findBookByUuid,
	listAudioFiles: audiobookRepository.listAudioFiles,
	getAudioFile: audiobookRepository.getAudioFile,
	findByBookId: audiobookMetadataRepository.findByBookId,
};

afterEach(() => {
	fileRepository.findBookByUuid = originals.findBookByUuid;
	audiobookRepository.listAudioFiles = originals.listAudioFiles;
	audiobookRepository.getAudioFile = originals.getAudioFile;
	audiobookMetadataRepository.findByBookId = originals.findByBookId;
	existingPaths.clear();
});

type BookRow = NonNullable<
	Awaited<ReturnType<typeof fileRepository.findBookByUuid>>
>;
type AudioFileRow = Awaited<
	ReturnType<typeof audiobookRepository.listAudioFiles>
>[number];

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const SERVER_ID = "org-1";

function stubBook(overrides: Partial<BookRow> = {}): BookRow {
	return {
		id: 1,
		uuid: UUID,
		filename: "book.epub",
		title: null,
		mediaType: "application/epub+zip",
		libraryMediaType: "ebook",
		relativePath: "novels/book.epub",
		libraryPath: "/library",
		filesizeKb: 2,
		...overrides,
	};
}

function audioFile(overrides: Partial<AudioFileRow> = {}): AudioFileRow {
	return {
		filename: "chapter 01.mp3",
		path: "/library/audio/book/chapter 01.mp3",
		filesize: 1000,
		mimeType: "audio/mpeg",
		...overrides,
	};
}

function patch(args: {
	book?: BookRow | null;
	audioFiles?: AudioFileRow[];
	metadataCover?: string | null;
}) {
	fileRepository.findBookByUuid = mock(async () => args.book ?? null);
	audiobookRepository.listAudioFiles = mock(async () => args.audioFiles ?? []);
	audiobookMetadataRepository.findByBookId = mock(
		async () =>
			(args.metadataCover === undefined
				? null
				: { cover: args.metadataCover }) as Awaited<
				ReturnType<typeof originals.findByBookId>
			>,
	);
}

// ─── getDownloadPayload ──────────────────────────────────────────────────────

describe("getDownloadPayload — ebooks", () => {
	test("uses the catalog title while preserving the file extension", async () => {
		patch({
			book: stubBook({
				filename: "opaque-scan-name.epub",
				title: "El nombre correcto",
			}),
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toMatchObject({
			kind: "file",
			filename: "El nombre correcto.epub",
		});
	});

	test("sanitizes unsafe title characters without losing Unicode", async () => {
		patch({
			book: stubBook({
				filename: "source.epub",
				title: '魔女の旅々: Volumen/1 "especial"',
			}),
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toMatchObject({
			filename: "魔女の旅々  Volumen 1  especial.epub",
		});
	});

	test("returns the ebook file directly", async () => {
		patch({ book: stubBook() });
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toEqual({
			kind: "file",
			mediaType: "ebook",
			filename: "book.epub",
			mimetype: "application/epub+zip",
			fullPath: path.join("/library", "novels/book.epub"),
			size: 2048,
		});
	});

	test("returns null for an unknown uuid", async () => {
		patch({ book: null });
		expect(await service.getDownloadPayload(UUID, SERVER_ID)).toBeNull();
	});

	test("downloads an AZW3 source unchanged", async () => {
		patch({
			book: stubBook({
				filename: "book.azw3",
				relativePath: "book.azw3",
				mediaType: "application/vnd.amazon.ebook",
			}),
		});
		expect(await service.getDownloadPayload(UUID, SERVER_ID)).toMatchObject({
			filename: "book.azw3",
			mimetype: "application/vnd.amazon.ebook",
			fullPath: path.join("/library", "book.azw3"),
		});
	});
});

describe("getDownloadPayload — audiobooks", () => {
	test("uses the catalog title for a single-file audiobook", async () => {
		patch({
			book: stubBook({
				libraryMediaType: "audiobook",
				filename: "folder-name",
				title: "La voz del libro",
			}),
			audioFiles: [audioFile({ filename: "recording.m4b" })],
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toMatchObject({ filename: "La voz del libro.m4b" });
	});

	test("single-file audiobook downloads the file directly", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "book.m4b" }),
			audioFiles: [
				audioFile({
					filename: "book.m4b",
					path: "/library/audio/book.m4b",
					mimeType: "audio/mp4",
					filesize: 5000,
				}),
			],
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toEqual({
			kind: "file",
			mediaType: "audiobook",
			filename: "book.m4b",
			mimetype: "audio/mp4",
			fullPath: "/library/audio/book.m4b",
			size: 5000,
		});
	});

	test("multi-file audiobook downloads a zip of its audio files", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "chapter 01.mp3", path: "/a/chapter 01.mp3" }),
				audioFile({ filename: "chapter 02.mp3", path: "/a/chapter 02.mp3" }),
			],
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload).toEqual({
			kind: "zip",
			mediaType: "audiobook",
			zipName: "My Book.zip",
			entries: [
				{ filename: "chapter 01.mp3", fullPath: "/a/chapter 01.mp3" },
				{ filename: "chapter 02.mp3", fullPath: "/a/chapter 02.mp3" },
			],
		});
	});

	test("duplicate filenames inside the zip get deduped", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "track.mp3", path: "/a/cd1/track.mp3" }),
				audioFile({ filename: "track.mp3", path: "/a/cd2/track.mp3" }),
			],
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		expect(payload?.kind).toBe("zip");
		if (payload?.kind !== "zip") return;
		expect(payload.entries.map((e) => e.filename)).toEqual([
			"track.mp3",
			"track (2).mp3",
		]);
	});

	test("audiobook without audio files resolves to null", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook" }),
			audioFiles: [],
		});
		expect(await service.getDownloadPayload(UUID, SERVER_ID)).toBeNull();
	});

	test("a cover missing on disk is skipped", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "01.mp3", path: "/a/01.mp3" }),
				audioFile({ filename: "02.mp3", path: "/a/02.mp3" }),
			],
			metadataCover: "does-not-exist.avif",
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		if (payload?.kind !== "zip") throw new Error("expected zip payload");
		expect(payload.entries).toHaveLength(2);
	});

	test("zip includes the stored cover when it exists", async () => {
		const coverName = "cover-uuid.avif";
		const coverPath = path.join(process.cwd(), "data/covers", coverName);
		existingPaths.add(coverPath);
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "01.mp3", path: "/a/01.mp3" }),
				audioFile({ filename: "02.mp3", path: "/a/02.mp3" }),
			],
			metadataCover: coverName,
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		if (payload?.kind !== "zip") throw new Error("expected zip payload");
		expect(payload.entries).toHaveLength(3);
		expect(payload.entries[2]).toEqual({
			filename: "cover.avif",
			fullPath: coverPath,
		});
	});

	test("cover stored with a data/covers prefix resolves inside COVERS_DIR", async () => {
		const coverPath = path.join(process.cwd(), "data/covers", "uuid.avif");
		existingPaths.add(coverPath);
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "01.mp3", path: "/a/01.mp3" }),
				audioFile({ filename: "02.mp3", path: "/a/02.mp3" }),
			],
			metadataCover: "data/covers/uuid.avif",
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		if (payload?.kind !== "zip") throw new Error("expected zip payload");
		expect(payload.entries[2]).toEqual({
			filename: "cover.avif",
			fullPath: coverPath,
		});
	});

	test("zip name strips filesystem-unsafe characters", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: 'A/B:"C"' }),
			audioFiles: [
				audioFile({ filename: "01.mp3", path: "/a/01.mp3" }),
				audioFile({ filename: "02.mp3", path: "/a/02.mp3" }),
			],
		});
		const payload = await service.getDownloadPayload(UUID, SERVER_ID);
		if (payload?.kind !== "zip") throw new Error("expected zip payload");
		expect(payload.zipName).not.toMatch(/[/\\:*?"<>|]/);
	});
});

// ─── getFileInfo / getFileDownload ───────────────────────────────────────────

describe("getFileInfo", () => {
	test("returns null for audiobooks (no single ebook file)", async () => {
		patch({ book: stubBook({ libraryMediaType: "audiobook" }) });
		expect(await service.getFileInfo(UUID, SERVER_ID)).toBeNull();
	});
});

describe("getFileDownload", () => {
	test("fails closed without a serverId", async () => {
		patch({ book: stubBook() });
		expect(await service.getFileDownload(UUID)).toBeNull();
	});

	test("returns a signed url with the zip filename for multi-file audiobooks", async () => {
		patch({
			book: stubBook({ libraryMediaType: "audiobook", filename: "My Book" }),
			audioFiles: [
				audioFile({ filename: "01.mp3", path: "/a/01.mp3" }),
				audioFile({ filename: "02.mp3", path: "/a/02.mp3" }),
			],
		});
		const result = await service.getFileDownload(UUID, SERVER_ID);
		expect(result?.filename).toBe("My Book.zip");
		expect(result?.mediaType).toBe("audiobook");
		expect(result?.url).toContain(`/download/${UUID}?exp=`);
	});
});

describe("getAudioFileDownload", () => {
	test("fails closed without a serverId", async () => {
		audiobookRepository.getAudioFile = mock(async () => {
			throw new Error("must not touch the repository");
		});
		expect(await service.getAudioFileDownload(UUID, 0)).toBeNull();
	});

	test("returns null for an unknown file index", async () => {
		audiobookRepository.getAudioFile = mock(async () => null);
		expect(await service.getAudioFileDownload(UUID, 99, SERVER_ID)).toBeNull();
	});

	test("returns a per-file signed url with the audio filename", async () => {
		audiobookRepository.getAudioFile = mock(
			async () =>
				({ filename: "chapter 02.mp3", path: "/a/chapter 02.mp3" }) as Awaited<
					ReturnType<typeof originals.getAudioFile>
				>,
		);
		const result = await service.getAudioFileDownload(UUID, 1, SERVER_ID);
		expect(result?.filename).toBe("chapter 02.mp3");
		expect(result?.url).toContain(`/download/${UUID}/file/1?exp=`);
	});
});

afterAll(() => {
	mock.restore();
	// Best-effort registry restore for files that run after this one.
	// `default` has to be restored explicitly: dropping it leaves every later
	// file that does `import fs from "node:fs/promises"` with no fs at all.
	mock.module("node:fs/promises", () => ({
		...priorFs,
		default: priorFs.default,
	}));
});
