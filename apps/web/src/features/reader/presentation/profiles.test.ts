import { describe, expect, test } from "bun:test";
import type { ReaderProfilesStore } from "./profiles";

process.env.VITE_SERVER_URL = "http://localhost:3000";
process.env.VITE_WEB_URL = "http://localhost:3001";

const { duplicateProfile } = await import("./profiles");
const { defaultReaderSettings } = await import("./settings");

describe("reader profile transforms", () => {
	test("uses the localized copy name and inserts the duplicate after its source", () => {
		const store: ReaderProfilesStore = {
			updatedAt: 0,
			profiles: [
				{ id: "day", name: "Día", settings: defaultReaderSettings },
				{ id: "night", name: "Noche", settings: defaultReaderSettings },
			],
		};

		const duplicate = duplicateProfile(
			store,
			"day",
			(name) => `Copia de ${name}`,
		);

		expect(duplicate.id).not.toBe("day");
		expect(
			duplicate.store.profiles.map(({ id, name }) => ({ id, name })),
		).toEqual([
			{ id: "day", name: "Día" },
			{ id: duplicate.id, name: "Copia de Día" },
			{ id: "night", name: "Noche" },
		]);
	});
});
