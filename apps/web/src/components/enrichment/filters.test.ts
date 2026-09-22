import { describe, expect, it } from "bun:test";
import { listInputFromSearch, parseEnrichmentSort } from "./filters";

describe("listInputFromSearch", () => {
	it("keeps a shared search query when no local query overrides it", () => {
		expect(listInputFromSearch({ q: "  Dune  " }).query).toBe("Dune");
	});

	it("turns the URL page into a server offset", () => {
		expect(listInputFromSearch({ page: 3 }).offset).toBe(100);
	});

	it("passes two URL sort criteria to the server in order", () => {
		expect(parseEnrichmentSort("title.asc,updated.desc")).toEqual([
			{ field: "title", direction: "asc" },
			{ field: "updated", direction: "desc" },
		]);
	});

	it("keeps unresolved inside the attention bucket", () => {
		expect(
			listInputFromSearch({ bucket: "attention", lifecycle: "unresolved" })
				.lifecycle,
		).toBe("unresolved");
	});

	it("drops a lifecycle that does not belong to the selected bucket", () => {
		expect(
			listInputFromSearch({ bucket: "completed", lifecycle: "unresolved" })
				.lifecycle,
		).toBeUndefined();
	});
});
