import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { m } from "@/paraglide/messages";
import { FieldRoutingEditor, type FieldRules } from "./field-routing-editor";
import type { MetadataProviderId } from "./provider-priority-list";

const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
afterEach(cleanup);

test("returning to general order follows source changes without changing update mode", () => {
	function Editor({ order }: { order: MetadataProviderId[] }) {
		const [rules, setRules] = useState<FieldRules>({
			cover: ["amazon", "googlebooks"],
		});
		return (
			<FieldRoutingEditor
				mediaType="ebook"
				order={order}
				value={rules}
				updates={{ cover: "if_provided" }}
				onUpdatesChange={() => {
					throw new Error("Order reset must preserve update mode");
				}}
				onChange={setRules}
				onPausedFieldsChange={() => {}}
			/>
		);
	}
	const view = render(<Editor order={["googlebooks", "amazon"]} />);
	const label = m["library.provider_field_cover"]();
	const row = view.getByRole("switch", { name: label }).closest("tr");
	if (!row) throw new Error("Missing field row");
	const scope = within(row);
	expect(scope.queryByText(m["library.field_order_general"]())).toBeNull();
	fireEvent.click(
		scope.getByRole("button", {
			name: `${m["library.field_use_general"]()}: ${label}`,
		}),
	);
	expect(
		scope.queryByRole("button", {
			name: `${m["library.field_use_general"]()}: ${label}`,
		}),
	).toBeNull();
	const providerNames = () =>
		scope
			.getAllByRole("button")
			.filter(
				(button) =>
					button.getAttribute("title") === m["library.rules_reorder"](),
			)
			.map((button) => button.getAttribute("aria-label")?.split(",")[0]);
	expect(providerNames()).toEqual(["Google Books", "Amazon"]);
	view.rerender(<Editor order={["amazon", "googlebooks"]} />);
	expect(providerNames()).toEqual(["Amazon", "Google Books"]);
});
