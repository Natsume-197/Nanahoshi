import "@/test-utils/setup-dom";

import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearReaderStorage,
	prepareReaderStorage,
	READER_STORAGE_KEYS,
} from "./reader-storage";

describe("reader storage account ownership", () => {
	beforeEach(() => window.localStorage.clear());

	test("keeps legacy settings for the first user that claims them", () => {
		window.localStorage.setItem(READER_STORAGE_KEYS.profiles, "profiles-a");
		prepareReaderStorage("user-a");

		expect(window.localStorage.getItem(READER_STORAGE_KEYS.profiles)).toBe(
			"profiles-a",
		);
	});

	test("clears every reader preference before a different user claims storage", () => {
		prepareReaderStorage("user-a");
		for (const key of Object.values(READER_STORAGE_KEYS)) {
			window.localStorage.setItem(key, key);
		}

		prepareReaderStorage("user-b");

		for (const key of Object.values(READER_STORAGE_KEYS)) {
			expect(window.localStorage.getItem(key)).toBeNull();
		}
	});

	test("clears the ownership marker together with preferences on sign-out", () => {
		prepareReaderStorage("user-a");
		window.localStorage.setItem(READER_STORAGE_KEYS.customThemes, "themes-a");
		clearReaderStorage();
		prepareReaderStorage("user-b");

		expect(
			window.localStorage.getItem(READER_STORAGE_KEYS.customThemes),
		).toBeNull();
	});
});
