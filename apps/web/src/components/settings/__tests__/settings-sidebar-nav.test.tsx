import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SettingsDialogShell } from "../settings-dialog-shell";
import {
	filterSettingsGroups,
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "../settings-sidebar-nav";

function TestIcon(props: ComponentProps<"svg">) {
	return <svg {...props} />;
}

const groups: SettingsNavGroup[] = [
	{
		label: "Account",
		items: [
			{ key: "profile", label: "Profile", icon: TestIcon },
			{ key: "privacy", label: "Privacy", icon: TestIcon },
		],
	},
];

afterEach(cleanup);

describe("SettingsSidebarNav", () => {
	it("announces the active destination in desktop and mobile navigation", () => {
		const { getAllByRole } = render(
			<SettingsSidebarNav
				groups={groups}
				activeKey="profile"
				onNavigate={() => undefined}
			/>,
		);

		const profileButtons = getAllByRole("button", { name: "Profile" });
		expect(profileButtons).toHaveLength(2);
		for (const button of profileButtons) {
			expect(button.getAttribute("aria-current")).toBe("page");
		}
	});

	it("filters section labels without changing the source groups", () => {
		expect(filterSettingsGroups(groups, " priv ")).toEqual([
			{
				label: "Account",
				items: [{ key: "privacy", label: "Privacy", icon: TestIcon }],
			},
		]);
		expect(filterSettingsGroups(groups, "missing")).toEqual([]);
		expect(groups[0]?.items).toHaveLength(2);
	});
});

describe("SettingsDialogShell", () => {
	it("exposes a named modal dialog and a working close action", () => {
		const onClose = mock(() => undefined);
		const { getByRole } = render(
			<SettingsDialogShell
				title="Profile"
				closeLabel="Close settings"
				groups={groups}
				activeKey="profile"
				onNavigate={() => undefined}
				onClose={onClose}
			>
				<p>Profile content</p>
			</SettingsDialogShell>,
		);

		const dialog = getByRole("dialog", { name: "Profile" });
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		fireEvent.click(getByRole("button", { name: "Close settings" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("closes a nested modal when its backdrop is clicked", () => {
		function NestedModalHarness() {
			const [open, setOpen] = useState(true);

			return (
				<SettingsDialogShell
					title="Jobs"
					closeLabel="Close settings"
					groups={groups}
					activeKey="profile"
					onNavigate={() => undefined}
					onClose={() => undefined}
				>
					<Modal open={open} onOpenChange={setOpen} title="Payload">
						<p>Payload content</p>
					</Modal>
				</SettingsDialogShell>
			);
		}

		const { getByRole, queryByRole } = render(<NestedModalHarness />);
		getByRole("dialog", { name: "Payload" });
		const backdrop = document.querySelector('[data-slot="modal-backdrop"]');

		expect(backdrop).not.toBeNull();
		fireEvent.pointerDown(backdrop as Element);
		fireEvent.click(backdrop as Element);
		expect(queryByRole("dialog", { name: "Payload" })).toBeNull();
	});
});
