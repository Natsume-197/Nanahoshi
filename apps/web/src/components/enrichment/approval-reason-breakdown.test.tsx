import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";

const { cleanup, render } = await import("@testing-library/react");
const { ApprovalReasonBreakdown } = await import("./approval-reason-breakdown");

afterEach(cleanup);

test("bulk approval shows every evidence count before confirmation", () => {
	const view = render(
		<ApprovalReasonBreakdown
			byReason={{ "title.match": 3, "author.match": 2 }}
		/>,
	);
	expect(view.getByText("3")).toBeTruthy();
	expect(view.getByText("2")).toBeTruthy();
});
