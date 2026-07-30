import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";

process.env.VITE_SERVER_URL = "http://localhost:3000";
(
	window.HTMLElement.prototype as HTMLElement & {
		attachEvent: () => void;
	}
).attachEvent = () => undefined;
(
	window.HTMLElement.prototype as HTMLElement & {
		detachEvent: () => void;
	}
).detachEvent = () => undefined;
const { CreateLibraryWizard } = await import("../create-library-wizard");

afterEach(cleanup);

function renderWizard(onSubmit = mock(() => undefined)) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<CreateLibraryWizard
				open
				onOpenChange={() => undefined}
				onSubmit={onSubmit}
				isPending={false}
			/>
		</QueryClientProvider>,
	);
	return { ...view, onSubmit };
}

describe("CreateLibraryWizard", () => {
	it("shows only essential decisions and explains a missing name", () => {
		const view = renderWizard();

		expect(view.getByRole("dialog", { name: "New Library" })).toBeTruthy();
		expect(view.getByLabelText("Name")).toBeTruthy();
		expect(view.getByText("Books")).toBeTruthy();
		expect(view.getByText("Audiobooks")).toBeTruthy();
		expect(view.queryByText(/Metadata providers/i)).toBeNull();
		expect(view.queryByText("Public library")).toBeNull();

		fireEvent.click(view.getByRole("button", { name: "Next" }));

		expect(view.getByText("Enter a name to continue.")).toBeTruthy();
		expect(view.getByLabelText("Name").getAttribute("aria-invalid")).toBe(
			"true",
		);
	});
});
