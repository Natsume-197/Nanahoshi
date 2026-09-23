import { afterEach, describe, expect, mock, test } from "bun:test";
import { bookMetadataRepository } from "../metadata.repository";
import { bookMetadataService } from "../metadata.service";
import { BOOK_PROVIDERS } from "../providers/registry";

type Internals = { runProviderCall: unknown };
const service = bookMetadataService as unknown as Internals;

const original = {
	getById: BOOK_PROVIDERS.googlebooks.getById,
	runProviderCall: service.runProviderCall,
	serverId: bookMetadataRepository.getServerIdByBookId,
	config: bookMetadataRepository.getLibraryMetadataConfig,
	locked: bookMetadataRepository.getLockedFields,
};

afterEach(() => {
	BOOK_PROVIDERS.googlebooks.getById = original.getById;
	service.runProviderCall = original.runProviderCall;
	bookMetadataRepository.getServerIdByBookId = original.serverId;
	bookMetadataRepository.getLibraryMetadataConfig = original.config;
	bookMetadataRepository.getLockedFields = original.locked;
});

describe("bookMetadataService.previewFromProvider", () => {
	test("never hands the provider the book uuid, so no cover is downloaded", async () => {
		service.runProviderCall = (
			_name: string,
			_context: unknown,
			call: () => Promise<unknown>,
		) => call();
		bookMetadataRepository.getServerIdByBookId = (async () =>
			"s") as typeof bookMetadataRepository.getServerIdByBookId;
		bookMetadataRepository.getLibraryMetadataConfig = (async () =>
			null) as typeof bookMetadataRepository.getLibraryMetadataConfig;
		bookMetadataRepository.getLockedFields =
			(async () => []) as typeof bookMetadataRepository.getLockedFields;
		const getById = mock(async () => ({
			title: "T",
			cover: "https://img/t.jpg",
		}));
		BOOK_PROVIDERS.googlebooks.getById =
			getById as unknown as typeof BOOK_PROVIDERS.googlebooks.getById;

		const result = await bookMetadataService.previewFromProvider(
			"googlebooks",
			{ bookId: 1, uuid: "book-uuid", providerId: "g1" },
		);

		const options = (getById.mock.calls[0] as unknown[])[1] as Record<
			string,
			unknown
		>;
		expect(options.uuid).toBeUndefined();
		expect(options.keepRemoteCover).toBe(true);
		expect(result?.metadata.cover).toBe("https://img/t.jpg");
	});
});
