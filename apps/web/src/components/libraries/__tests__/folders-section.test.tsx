import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";

process.env.VITE_SERVER_URL = "http://localhost:3000";

import type { FolderHealth } from "../library-detail/folders-section";

const { FoldersSection } = await import("../library-detail/folders-section");

afterEach(cleanup);

const library = {
	id: 1,
	uuid: "11111111-1111-1111-1111-111111111111",
	name: "TMW Collection",
	isPublic: false,
	mediaType: "ebook" as const,
	metadataProviders: ["ranobedb"],
	metadataConfig: {},
	createdAt: "2026-07-01T00:00:00.000Z",
	paths: [
		{
			id: 10,
			libraryId: 1,
			path: "/books/ok",
			isEnabled: true,
			createdAt: "2026-07-01T00:00:00.000Z",
		},
		{
			id: 11,
			libraryId: 1,
			path: "/mnt/nas/gone",
			isEnabled: true,
			createdAt: "2026-07-01T00:00:00.000Z",
		},
		{
			id: 12,
			libraryId: 1,
			path: "/books/paused",
			isEnabled: false,
			createdAt: "2026-07-01T00:00:00.000Z",
		},
	],
};

function renderFolders(health?: FolderHealth[]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<FoldersSection library={library} canManage health={health} />
		</QueryClientProvider>,
	);
}

const health: FolderHealth[] = [
	{
		pathId: 10,
		path: "/books/ok",
		isEnabled: true,
		state: "ok",
		reason: null,
		bookCount: 348,
	},
	{
		pathId: 11,
		path: "/mnt/nas/gone",
		isEnabled: true,
		state: "missing",
		reason: "ENOENT",
		bookCount: 12,
	},
	{
		pathId: 12,
		path: "/books/paused",
		isEnabled: false,
		state: "ok",
		reason: null,
		bookCount: 4,
	},
];

describe("FoldersSection", () => {
	it("names why a folder stopped working instead of looking healthy", () => {
		const view = renderFolders(health);

		expect(view.getByText("Not found on the server")).toBeTruthy();
		// A reachable folder reports what it contributed to the catalog.
		expect(view.getByText("348 books")).toBeTruthy();
		expect(view.getByText("Disabled, skipped when scanning")).toBeTruthy();
	});

	it("shows a checking state only while health is unknown", () => {
		const view = renderFolders(undefined);

		// The disabled folder reports that instead: it is skipped either way.
		expect(view.getAllByText("Checking…")).toHaveLength(2);
		expect(view.getByText("Disabled, skipped when scanning")).toBeTruthy();
	});

	it("does not claim a folder is broken before its verdict arrives", () => {
		// Health loaded, but this folder was added after the probe ran.
		const view = renderFolders([health[0] as FolderHealth]);

		expect(view.queryByText("Checking…")).toBeNull();
		expect(view.queryByText("Not found on the server")).toBeNull();
		expect(view.getByText("348 books")).toBeTruthy();
	});
});
