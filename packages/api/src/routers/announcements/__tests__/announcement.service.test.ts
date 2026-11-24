import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Run with:
 *   bun test packages/api/src/routers/announcements/__tests__/announcement.service.test.ts
 */

type Row = {
	id: string;
	serverId: string | null;
	severity: "info" | "success" | "warning" | "danger";
	title: string;
	body: string | null;
	dismissible: boolean;
	createdAt: string;
};

const row = (over: Partial<Row>): Row => ({
	id: "a1",
	serverId: null,
	severity: "info",
	title: "Hola",
	body: null,
	dismissible: true,
	createdAt: "2026-11-01T00:00:00.000Z",
	...over,
});

let memberOf = new Set<string>();
let activeRows: Row[] = [];
let byId: Row | null = null;
let inScope: Row | null = null;
const dismissCalls: Array<[string, string]> = [];
const listActiveCalls: Array<[string, string | null]> = [];
const updateCalls: Array<{ reset: boolean }> = [];

const realAccess = await import("../../../auth/access.repository");
mock.module("../../../auth/access.repository", () => ({
	...realAccess,
	getUserPermissionContext: async (
		_userId: string,
		serverId: string,
		opts: { isAppOwner: boolean },
	) => ({
		isAppOwner: opts.isAppOwner,
		isMember: memberOf.has(serverId),
	}),
}));

mock.module("../announcement.repository", () => ({
	announcementRepository: {
		listActiveForUser: async (userId: string, serverId: string | null) => {
			listActiveCalls.push([userId, serverId]);
			return activeRows;
		},
		findById: async () => byId,
		findInScope: async () => inScope,
		dismiss: async (id: string, userId: string) => {
			dismissCalls.push([id, userId]);
		},
		update: async (
			_id: string,
			_scope: string | null,
			fields: object,
			reset: boolean,
		) => {
			updateCalls.push({ reset });
			return { ...inScope, ...fields };
		},
		delete: async () => inScope !== null,
	},
}));

const service = await import("../announcement.service");

const fields = {
	severity: "info" as const,
	title: "Hola",
	body: null,
	dismissible: true,
	startsAt: null,
	endsAt: null,
};

beforeEach(() => {
	memberOf = new Set();
	activeRows = [];
	byId = null;
	inScope = null;
	dismissCalls.length = 0;
	listActiveCalls.length = 0;
	updateCalls.length = 0;
});

describe("listActive", () => {
	test("drops the active server when the user is no longer a member", async () => {
		await service.listActive({
			userId: "u1",
			activeServerId: "s1",
			isAppOwner: false,
		});
		expect(listActiveCalls).toEqual([["u1", null]]);
	});

	test("includes the active server for members", async () => {
		memberOf.add("s1");
		await service.listActive({
			userId: "u1",
			activeServerId: "s1",
			isAppOwner: false,
		});
		expect(listActiveCalls).toEqual([["u1", "s1"]]);
	});

	test("puts danger first, then instance-wide before server, newest first", async () => {
		activeRows = [
			row({ id: "info-old", createdAt: "2026-01-01T00:00:00Z" }),
			row({ id: "server-danger", severity: "danger", serverId: "s1" }),
			row({ id: "info-new", createdAt: "2026-02-01T00:00:00Z" }),
			row({ id: "instance-danger", severity: "danger" }),
			row({ id: "success", severity: "success" }),
		];
		const out = await service.listActive({
			userId: "u1",
			activeServerId: null,
			isAppOwner: false,
		});
		expect(out.map((r) => r.id)).toEqual([
			"instance-danger",
			"server-danger",
			"info-new",
			"info-old",
			"success",
		]);
	});
});

describe("dismiss", () => {
	const args = {
		id: "a1",
		userId: "u1",
		activeServerId: "s1",
		isAppOwner: false,
	};

	test("records an instance banner dismissal", async () => {
		byId = row({});
		await service.dismiss(args);
		expect(dismissCalls).toEqual([["a1", "u1"]]);
	});

	test("refuses a banner that cannot be closed", async () => {
		byId = row({ dismissible: false });
		await expect(service.dismiss(args)).rejects.toThrow("cannot be dismissed");
		expect(dismissCalls).toHaveLength(0);
	});

	test("hides another server's banner behind not-found", async () => {
		memberOf.add("s1");
		byId = row({ serverId: "s2" });
		await expect(service.dismiss(args)).rejects.toThrow("not found");
	});

	test("rejects a server banner once the user left that server", async () => {
		byId = row({ serverId: "s1" });
		await expect(service.dismiss(args)).rejects.toThrow("not found");
	});
});

describe("update", () => {
	test("re-shows the banner when its text changes", async () => {
		inScope = row({});
		await service.update(null, "a1", { ...fields, title: "Nuevo texto" });
		expect(updateCalls).toEqual([{ reset: true }]);
	});

	test("re-shows it when it stops being closable", async () => {
		inScope = row({});
		await service.update(null, "a1", { ...fields, dismissible: false });
		expect(updateCalls).toEqual([{ reset: true }]);
	});

	test("keeps dismissals when only the schedule moves", async () => {
		inScope = row({});
		await service.update(null, "a1", {
			...fields,
			endsAt: "2026-12-01T00:00:00Z",
		});
		expect(updateCalls).toEqual([{ reset: false }]);
	});

	test("cannot touch a banner outside its scope", async () => {
		inScope = null;
		await expect(service.update("s1", "a1", fields)).rejects.toThrow(
			"not found",
		);
		expect(updateCalls).toHaveLength(0);
	});
});
