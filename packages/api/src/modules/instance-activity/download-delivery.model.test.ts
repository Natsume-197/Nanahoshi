import { describe, expect, test } from "bun:test";
import { toDownloadDeliveryRow } from "./download-delivery.model";

describe("Download Delivery Event", () => {
	test("snapshots the authorized delivery and defaults a single file", () => {
		expect(
			toDownloadDeliveryRow({
				deliveryKind: "ebook",
				source: "web",
				user: { id: "user-1", name: "María" },
				sessionId: "session-1",
				server: { id: "server-1", name: "Biblioteca" },
				item: { uuid: "book-1", title: "El libro" },
				filename: "El libro.epub",
				device: "Browser",
				ipAddress: "203.0.113.10",
			}),
		).toEqual({
			deliveryKind: "ebook",
			source: "web",
			userId: "user-1",
			userName: "María",
			sessionId: "session-1",
			serverId: "server-1",
			serverName: "Biblioteca",
			itemUuid: "book-1",
			itemTitle: "El libro",
			filename: "El libro.epub",
			fileCount: 1,
			device: "Browser",
			ipAddress: "203.0.113.10",
		});
	});

	test("records the number of files represented by a series archive", () => {
		const row = toDownloadDeliveryRow({
			deliveryKind: "series",
			source: "web",
			user: { id: "user-1" },
			server: { id: "server-1" },
			item: { uuid: "series-1", title: "Serie" },
			filename: "Serie.zip",
			fileCount: 12,
		});

		expect(row.fileCount).toBe(12);
		expect(row.userName).toBeNull();
		expect(row.sessionId).toBeNull();
	});
});
