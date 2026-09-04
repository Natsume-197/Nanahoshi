import "@/test-utils/setup-dom";

import { afterEach, describe, expect, test } from "bun:test";
import { useState } from "react";

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { ToggleGroup, ToggleGroupItem } = await import("./toggle-group");

afterEach(cleanup);

function ContentTypeFilters() {
	const [value, setValue] = useState<string[]>([]);
	return (
		<ToggleGroup
			multiple
			value={value}
			onValueChange={setValue}
			variant="outline"
		>
			<ToggleGroupItem value="ebook">Ebook</ToggleGroupItem>
			<ToggleGroupItem value="audiobook">Audiobook</ToggleGroupItem>
		</ToggleGroup>
	);
}

describe("ToggleGroup", () => {
	test("exposes and styles the active state after selecting an option", () => {
		render(<ContentTypeFilters />);

		const ebook = screen.getByRole("button", { name: "Ebook" });
		expect(ebook.hasAttribute("data-pressed")).toBe(false);

		fireEvent.click(ebook);

		expect(ebook.hasAttribute("data-pressed")).toBe(true);
		expect(ebook.className).toContain("data-pressed:bg-muted");
	});
});
