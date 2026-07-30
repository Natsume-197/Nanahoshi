import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { ImageUploadRow } from "../image-upload-row";
import { SettingControlRow, SettingRows } from "../setting-rows";

afterEach(cleanup);

/**
 * A container query never matches the element that declares `@container`, so a
 * row that both declares the container and carries the `@…:flex-row` variants
 * stays stacked forever — the control renders below the label instead of beside
 * it. These tests pin the container onto an ancestor of the variants.
 */
function assertContainerIsAncestorOfVariants(root: HTMLElement, name: string) {
	const container = root.querySelector<HTMLElement>(`.\\@container\\/${name}`);
	expect(container).not.toBeNull();
	if (!container) return;

	const variantClass = `@xl/${name}:flex-row`;
	expect(container.className).not.toContain(`/${name}:`);

	const responsive = Array.from(container.querySelectorAll("*")).find((node) =>
		node.className.toString().includes(variantClass),
	);
	expect(responsive).toBeDefined();
}

describe("SettingControlRow", () => {
	it("puts the row container above the elements that query it", () => {
		const { container } = render(
			<SettingRows>
				<SettingControlRow label={<span>Share activity</span>}>
					<button type="button">Toggle</button>
				</SettingControlRow>
			</SettingRows>,
		);

		assertContainerIsAncestorOfVariants(
			container as HTMLElement,
			"settings-row",
		);
	});

	it("keeps the control beside the label and the description with it", () => {
		const { getByText, container } = render(
			<SettingControlRow
				label={<span>Profile color</span>}
				description="Shown on your profile banner."
			>
				<button type="button">Pick</button>
			</SettingControlRow>,
		);

		const row = (container as HTMLElement).querySelector(
			".\\@container\\/settings-row > *",
		);
		expect(row).not.toBeNull();
		// Label block and control block are the two flex children of the row.
		expect(row?.children).toHaveLength(2);
		expect(row?.children[0]?.contains(getByText("Profile color"))).toBe(true);
		expect(
			row?.children[0]?.contains(getByText("Shown on your profile banner.")),
		).toBe(true);
		expect(row?.children[1]?.contains(getByText("Pick"))).toBe(true);
	});
});

describe("ImageUploadRow", () => {
	it("puts the row container above the elements that query it", () => {
		const { container } = render(
			<ImageUploadRow
				variant="settings"
				title="Avatar"
				description="PNG or JPG."
				loading={false}
				inputRef={createRef<HTMLInputElement>()}
				accept="image/*"
				onChange={() => undefined}
				uploading={false}
				preview={<span>preview</span>}
				actionLabel="Upload avatar"
			/>,
		);

		assertContainerIsAncestorOfVariants(container as HTMLElement, "image-row");
	});
});
