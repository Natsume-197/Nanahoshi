import "@/test-utils/setup-dom";

process.env.VITE_SERVER_URL = "http://localhost:3000";

import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { coverPresets } from "@/utils/covers";
import { BookCardShell } from "../book-card-shell";

afterEach(cleanup);

describe("BookCardShell", () => {
	it("uses the whole Continue card as the immediate action without rendering a detail link", () => {
		const activate = mock(() => {});
		const view = render(
			<BookCardShell
				linkProps={{
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: "a1" },
				}}
				ariaLabel="A short audiobook"
				onCardAction={activate}
				cardActionAriaLabel="Listen to A short audiobook"
				fullCardAction
				coverPreset={coverPresets.small}
				title="A short audiobook"
			/>,
		);

		expect(view.queryByRole("link")).toBeNull();
		expect(
			view.getByText("A short audiobook").parentElement?.className,
		).toContain("pointer-events-none");
		fireEvent.click(
			view.getByRole("button", { name: "Listen to A short audiobook" }),
		);
		expect(activate).toHaveBeenCalledTimes(1);
	});
});
