import "@nanahoshi/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type FakePairing = {
	id: string;
	alignment: { status: string };
	ebook: { uuid: string; title: string | null; filename: string };
	audiobook: { uuid: string; title: string | null; filename: string };
};

let pairings: FakePairing[] = [];

mock.module("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		search,
		...rest
	}: {
		children: ReactNode;
		params: { uuid: string };
		search: { pair: string };
	}) => (
		<a {...rest} href={`/reader/${params.uuid}?pair=${search.pair}`}>
			{children}
		</a>
	),
}));
mock.module("@/utils/orpc", () => ({
	orpc: {
		readListen: {
			getPairings: {
				queryOptions: ({ input }: { input: { publicationUuid: string } }) => ({
					queryKey: ["pairings", input.publicationUuid],
					queryFn: async () => ({ pairings }),
				}),
			},
		},
	},
}));

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { ReadListenButton } = await import("./read-listen-button");
const { m } = await import("@/paraglide/messages");
const label = () => m["read_listen.open_reader"]();

afterEach(() => {
	cleanup();
	pairings = [];
});

function pairing(
	id: string,
	status: string,
	audiobookTitle: string,
): FakePairing {
	return {
		id,
		alignment: { status },
		ebook: { uuid: "ebook-1", title: "Oregairu", filename: "oregairu.epub" },
		audiobook: {
			uuid: `audio-${id}`,
			title: audiobookTitle,
			filename: `${id}.m4b`,
		},
	};
}

function mount() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ReadListenButton publicationUuid="ebook-1" mediaType="ebook" />
			<span>loaded</span>
		</QueryClientProvider>,
	);
}

describe("ReadListenButton", () => {
	test("stays hidden until an alignment is ready", async () => {
		pairings = [pairing("p1", "stale", "Oregairu (audio)")];
		mount();
		await screen.findByText("loaded");
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByText(label())).toBeNull();
	});

	test("one ready pairing opens the synchronized reader directly", async () => {
		pairings = [
			pairing("p1", "ready", "Oregairu (audio)"),
			pairing("p2", "stale", "Other narration"),
		];
		mount();
		const button = await screen.findByText(label());
		expect(button.closest("a")?.getAttribute("href")).toBe(
			"/reader/ebook-1?pair=p1",
		);
	});

	test("several ready pairings ask which edition to open", async () => {
		pairings = [
			pairing("p1", "ready", "Narration A"),
			pairing("p2", "ready", "Narration B"),
		];
		mount();
		const button = await screen.findByText(label());
		expect(button.closest("a")).toBeNull();
		fireEvent.click(button.closest("button") as HTMLButtonElement);
		const second = await screen.findByText("Narration B");
		expect(second.closest("a")?.getAttribute("href")).toBe(
			"/reader/ebook-1?pair=p2",
		);
		expect(screen.getByText("Narration A")).toBeTruthy();
	});
});
