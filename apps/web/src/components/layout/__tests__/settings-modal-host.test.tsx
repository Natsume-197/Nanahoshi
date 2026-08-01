import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

mock.module("@/components/settings/settings-modal", () => ({
	SettingsModal: ({ onClose }: { onClose: () => void }) => (
		<div role="dialog" aria-label="Settings">
			<button type="button" onClick={onClose}>
				Close
			</button>
		</div>
	),
}));

const { useSettingsModal } = await import("../settings-modal-context");
const { SettingsModalHost } = await import("../settings-modal-host");

afterEach(cleanup);

describe("SettingsModalHost", () => {
	it("can close account settings after sign-out completes", async () => {
		function Harness() {
			const controls = useSettingsModal();

			return (
				<>
					<button
						type="button"
						onClick={() => controls.openSettings("account")}
					>
						Open settings
					</button>
					<button type="button" onClick={controls.closeSettings}>
						Sign out completed
					</button>
				</>
			);
		}

		const { findByRole, getByRole, queryByRole } = render(
			<SettingsModalHost>
				<Harness />
			</SettingsModalHost>,
		);

		fireEvent.click(getByRole("button", { name: "Open settings" }));
		await findByRole("dialog", { name: "Settings" });
		fireEvent.click(getByRole("button", { name: "Sign out completed" }));

		await waitFor(() => {
			expect(queryByRole("dialog", { name: "Settings" })).toBeNull();
		});
	});
});
