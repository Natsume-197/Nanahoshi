import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { m } from "@/paraglide/messages";
import { HomeFormatToggle } from "../home-format-toggle";

afterEach(() => {
	cleanup();
});

describe("HomeFormatToggle", () => {
	it("groups the mutually exclusive formats into one labelled control", () => {
		const view = render(
			<HomeFormatToggle scope="all" hasBooks hasAudiobooks />,
		);

		const group = view.getByRole("group", {
			name: m["home.scope_label"](),
		});
		const segments = view.getAllByRole("button");

		expect(group.className).toContain("max-w-xs");
		expect(segments).toHaveLength(3);
		for (const segment of segments) {
			expect(segment.className).toContain(
				"group-data-[variant=segmented]/toggle-group:flex-1",
			);
		}
		expect(
			view
				.getByRole("button", { name: m["home.scope_all"]() })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("disappears when there is only one available format", () => {
		const { container } = render(
			<HomeFormatToggle scope="books" hasBooks hasAudiobooks={false} />,
		);

		expect(container.childElementCount).toBe(0);
	});
});
