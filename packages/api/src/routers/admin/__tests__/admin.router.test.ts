import { beforeEach, describe, expect, mock, test } from "bun:test";

const deleteUser = mock(async (_userId: string, _actingUserId: string) => {});

mock.module("../admin.service", () => ({
	deleteUser,
}));

const { adminRouter } = await import("../admin.router");
const { callAs, expectRejectsWithCode } = await import(
	"../../../__tests__/helpers/authHarness"
);

describe("adminRouter.deleteUser", () => {
	beforeEach(() => {
		deleteUser.mockClear();
	});

	test("rejects a non-admin", async () => {
		await expectRejectsWithCode(
			callAs(
				adminRouter.deleteUser,
				{ userId: "target-user" },
				{ role: "user" },
			),
			"FORBIDDEN",
		);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	test("passes the target and acting admin to the service", async () => {
		await expect(
			callAs(
				adminRouter.deleteUser,
				{ userId: "target-user" },
				{ userId: "admin-user", role: "admin" },
			),
		).resolves.toEqual({ success: true });
		expect(deleteUser).toHaveBeenCalledWith("target-user", "admin-user");
	});
});
