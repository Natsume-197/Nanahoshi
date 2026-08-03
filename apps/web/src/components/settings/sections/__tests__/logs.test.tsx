import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";

mock.module("@/utils/orpc", () => ({
	orpc: {
		settings: {
			listLogs: { queryOptions: () => ({ queryKey: ["settings", "logs"] }) },
		},
	},
}));

const { AdminLogs, filterLogEntries, LogLevelBadge, LogSourceBadge } =
	await import("../logs");

afterEach(cleanup);

describe("LogSourceBadge", () => {
	it("treats a legacy log without a source as a server log", () => {
		const { getByText } = render(<LogSourceBadge source={undefined} />);

		expect(getByText("Server")).toBeTruthy();
	});
});

describe("LogLevelBadge", () => {
	it("uses neutral high-contrast text for destructive levels", () => {
		const { getByText } = render(<LogLevelBadge level="error" />);

		expect(getByText("Error").classList.contains("text-foreground")).toBe(true);
	});
});

const entries = [
	{
		id: "server:test:1",
		timestamp: "2026-08-01T12:00:00.000Z",
		level: "info" as const,
		source: "server" as const,
		message: "Server ready",
		context: { port: 3000 },
	},
	{
		id: "worker:test:1",
		timestamp: "2026-08-01T12:01:00.000Z",
		level: "warn" as const,
		source: "worker" as const,
		message: "Queue delayed",
		context: {},
	},
];

function renderLogs() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { queryFn: async () => entries, retry: false } },
	});
	queryClient.setQueryData(["settings", "logs", { schemaVersion: 2 }], entries);

	return render(
		<QueryClientProvider client={queryClient}>
			<AdminLogs />
		</QueryClientProvider>,
	);
}

describe("AdminLogs", () => {
	it("labels the filters, results, and table", () => {
		const { getByLabelText, getByRole, getByText } = renderLogs();

		expect(getByLabelText("Search")).toBeTruthy();
		expect(getByText("Level", { selector: "label" })).toBeTruthy();
		expect(getByText("Source", { selector: "label" })).toBeTruthy();
		expect(getByRole("combobox", { name: "Level" })).toBeTruthy();
		expect(getByRole("combobox", { name: "Source" })).toBeTruthy();
		expect(getByRole("status").textContent).toContain("2 of 2 logs");
		expect(getByRole("table", { name: "Nanahoshi log events" })).toBeTruthy();
	});

	it("filters by message, context, level, and source", () => {
		expect(
			filterLogEntries(entries, {
				query: "3000",
				level: "info",
				source: "server",
			}),
		).toEqual([entries[0]]);
		expect(
			filterLogEntries(entries, {
				query: "queue",
				level: "all",
				source: "worker",
			}),
		).toEqual([entries[1]]);
	});
});
