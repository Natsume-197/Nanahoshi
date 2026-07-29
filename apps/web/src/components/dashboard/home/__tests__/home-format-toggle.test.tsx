import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { HomeFormatToggle } from "../home-format-toggle";

afterEach(() => {
	cleanup();
});

describe("HomeFormatToggle", () => {
	it("disappears when there is only one available format", () => {
		const { container } = render(
			<HomeFormatToggle scope="books" hasBooks hasAudiobooks={false} />,
		);

		expect(container.childElementCount).toBe(0);
	});
});
