import "@/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

const { cleanup, render } = await import("@testing-library/react");
let isSheet = false;
const backDismiss = mock(() => {});
mock.module("@/hooks/use-mobile", () => ({
	useActivityRailIsSheet: () => isSheet,
}));
mock.module("@/hooks/use-overlay-back-dismiss", () => ({
	useOverlayBackDismiss: backDismiss,
}));
mock.module("@/components/shared/members-list", () => ({
	MembersList: () => <div data-testid="members" />,
}));
const Wrapper = ({ children }: { children?: ReactNode }) => (
	<div>{children}</div>
);
mock.module("@/components/ui/sheet", () => ({
	Sheet: Wrapper,
	SheetContent: Wrapper,
	SheetDescription: Wrapper,
	SheetHeader: Wrapper,
	SheetTitle: Wrapper,
}));
const { ActivityRail } = await import("./activity-rail");

afterEach(() => {
	cleanup();
	backDismiss.mockClear();
});

describe("activity rail visibility", () => {
	for (const mobile of [false, true]) {
		test(`mounts exactly one list only while open (${mobile ? "mobile" : "desktop"})`, () => {
			isSheet = mobile;
			const onClose = mock(() => {});
			const view = render(<ActivityRail open={false} onClose={onClose} />);
			expect(view.queryAllByTestId("members")).toHaveLength(0);
			view.rerender(<ActivityRail open onClose={onClose} />);
			expect(view.queryAllByTestId("members")).toHaveLength(1);
			expect(backDismiss).toHaveBeenLastCalledWith(mobile, onClose);
			view.rerender(<ActivityRail open={false} onClose={onClose} />);
			expect(view.queryAllByTestId("members")).toHaveLength(0);
		});
	}
});
