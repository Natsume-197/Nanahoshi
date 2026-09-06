import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import {
	acknowledgeSession,
	pendingSessions,
	persistSession,
	sessionOutboxIssues,
	sessionOwnerLock,
	syncSessionOutbox,
} from "./session-outbox";

afterEach(() => localStorage.clear());
function upload(count = 1): SessionUpload {
	const id = crypto.randomUUID();
	return {
		id,
		bookUuid: "book",
		runId: null,
		startedAt: "2026-01-01T00:00:00.000Z",
		endedAt: null,
		state: "active",
		revision: 1,
		mode: "automatic",
		source: "web",
		device: "Desktop",
		installationId: id,
		contentVersion: "hash",
		timeZone: "UTC",
		segments: Array.from({ length: count }, () => ({
			id: crypto.randomUUID(),
			startedAt: "2026-01-01T00:00:00.000Z",
			endedAt: "2026-01-01T00:00:10.000Z",
			seconds: 10,
			startPosition: 0,
			endPosition: 0.01,
			kind: "reading",
		})),
	};
}
test("outbox is isolated by account", () => {
	persistSession("alice", upload());
	expect(pendingSessions("bob")).toHaveLength(0);
	expect(pendingSessions("alice")).toHaveLength(1);
});
test("acknowledging a request preserves segments added while it was in flight", () => {
	const old = upload();
	persistSession("alice", old);
	const newer = {
		...old,
		revision: 2,
		segments: [...old.segments, ...upload().segments],
	};
	persistSession("alice", newer);
	acknowledgeSession("alice", old, crypto.randomUUID());
	expect(pendingSessions("alice")[0]?.segments).toHaveLength(1);
	expect(pendingSessions("alice")[0]?.revision).toBe(2);
});
test("long offline sessions retain segments beyond one upload batch", () => {
	const row = upload(250);
	persistSession("alice", row);
	const batch = { ...row, segments: row.segments.slice(0, 200) };
	acknowledgeSession("alice", batch, crypto.randomUUID());
	const rest = pendingSessions("alice")[0];
	expect(rest?.segments).toHaveLength(50);
	expect(rest?.revision).toBe(2);
	if (rest) acknowledgeSession("alice", rest, crypto.randomUUID());
	expect(pendingSessions("alice")).toHaveLength(0);
});
test("acknowledged active sessions keep a durable lifecycle record", () => {
	const row = upload();
	persistSession("alice", row);
	const runId = crypto.randomUUID();
	acknowledgeSession("alice", row, runId);
	expect(pendingSessions("alice")).toHaveLength(0);
	const stored = JSON.parse(
		localStorage.getItem(`nanahoshi:reading-outbox:alice:${row.id}`) ?? "null",
	);
	expect(stored?.state).toBe("active");
	expect(stored?.runId).toBe(runId);
	expect(stored?.segments).toHaveLength(0);
});

function locksHeldBy(...names: string[]) {
	return {
		request: async (
			name: string,
			_options: unknown,
			callback: (lock: unknown) => unknown,
		) => callback(names.includes(name) ? null : { name }),
	} as unknown as LockManager;
}

test("one failed upload does not block later entries and explicit retry recovers terminal failures", async () => {
	const failed = upload();
	const later = upload();
	persistSession("alice", failed, "tab");
	persistSession("alice", later, "tab");
	const seen: string[] = [];
	const options = {
		userId: "alice",
		ownerId: "tab",
		locks: locksHeldBy(),
		upload: async (row: SessionUpload) => {
			seen.push(row.id);
			if (row.id === failed.id)
				throw Object.assign(new Error("Book unavailable"), { status: 404 });
			return { runId: crypto.randomUUID() };
		},
	};
	expect(await syncSessionOutbox(options)).toBe(true);
	expect(seen).toEqual([failed.id, later.id]);
	expect(pendingSessions("alice").map((row) => row.id)).toEqual([failed.id]);
	expect(sessionOutboxIssues("alice")[0]).toMatchObject({
		id: failed.id,
		terminal: true,
	});
	expect(
		JSON.parse(sessionOutboxIssues("alice")[0]?.raw ?? "null").segments,
	).toEqual(failed.segments);
	await syncSessionOutbox(options);
	expect(seen).toHaveLength(2);
	await syncSessionOutbox({
		...options,
		retry: true,
		upload: async () => ({ runId: crypto.randomUUID() }),
	});
	expect(sessionOutboxIssues("alice")).toHaveLength(0);
	expect(pendingSessions("alice")).toHaveLength(0);
});

test("a hidden tab's lifecycle lock prevents finalizing or uploading its session", async () => {
	const hidden = upload();
	persistSession("alice", hidden, "hidden-tab");
	const seen: SessionUpload[] = [];
	await syncSessionOutbox({
		userId: "alice",
		ownerId: "visible-tab",
		locks: locksHeldBy(sessionOwnerLock("alice", "hidden-tab")),
		upload: async (row) => {
			seen.push(row);
			return { runId: crypto.randomUUID() };
		},
	});
	expect(seen).toHaveLength(0);
	expect(pendingSessions("alice")[0]?.state).toBe("active");
});

test("a crashed acknowledged session is finalized at its last durable observation", async () => {
	const row = upload();
	persistSession("alice", row, "crashed-tab");
	const runId = crypto.randomUUID();
	acknowledgeSession("alice", row, runId);
	const seen: SessionUpload[] = [];
	await syncSessionOutbox({
		userId: "alice",
		ownerId: "new-tab",
		locks: locksHeldBy(),
		upload: async (sent) => {
			seen.push(sent);
			return { runId };
		},
	});
	expect(seen[0]).toMatchObject({
		id: row.id,
		state: "finished",
		endedAt: row.segments[0]?.endedAt,
		runId,
		revision: 2,
		segments: [],
	});
	expect(seen[0]).not.toHaveProperty("ownerId");
	expect(
		localStorage.getItem(`nanahoshi:reading-outbox:alice:${row.id}`),
	).toBeNull();
});

test("damaged history is visible and exportable without preventing valid uploads", async () => {
	const key = "nanahoshi:reading-outbox:alice:damaged";
	localStorage.setItem(key, "{broken");
	persistSession("alice", upload(), "tab");
	await syncSessionOutbox({
		userId: "alice",
		ownerId: "tab",
		locks: locksHeldBy(),
		upload: async () => ({ runId: crypto.randomUUID() }),
	});
	expect(sessionOutboxIssues("alice")).toEqual([
		{
			id: "damaged",
			message: "Stored reading history could not be read.",
			terminal: true,
			raw: "{broken",
		},
	]);
	expect(sessionOutboxIssues("bob")).toHaveLength(0);
	expect(localStorage.getItem(key)).toBe("{broken");
	expect(pendingSessions("alice")).toHaveLength(0);
});

test("a terminal failure remains visible when new segments are saved", async () => {
	const row = upload();
	persistSession("alice", row, "tab");
	await syncSessionOutbox({
		userId: "alice",
		ownerId: "tab",
		locks: locksHeldBy(),
		upload: async () => {
			throw Object.assign(new Error("Invalid session"), { status: 400 });
		},
	});
	persistSession(
		"alice",
		{ ...row, revision: 2, segments: [...row.segments, ...upload().segments] },
		"tab",
	);
	expect(sessionOutboxIssues("alice")[0]?.terminal).toBe(true);
	expect(pendingSessions("alice")[0]?.segments).toHaveLength(2);
});

test("transient failures retry automatically without losing segments", async () => {
	const row = upload();
	persistSession("alice", row, "tab");
	const options = { userId: "alice", ownerId: "tab", locks: locksHeldBy() };
	await syncSessionOutbox({
		...options,
		upload: async () => {
			throw new TypeError("Offline");
		},
	});
	expect(sessionOutboxIssues("alice")[0]?.terminal).toBe(false);
	expect(pendingSessions("alice")[0]?.segments).toEqual(row.segments);
	await syncSessionOutbox({
		...options,
		upload: async () => ({ runId: crypto.randomUUID() }),
	});
	expect(sessionOutboxIssues("alice")).toHaveLength(0);
});

test("later queue entries are reloaded after awaiting an earlier upload", async () => {
	const first = upload();
	const later = upload();
	persistSession("alice", first, "tab");
	persistSession("alice", later, "tab");
	const seen: SessionUpload[] = [];
	await syncSessionOutbox({
		userId: "alice",
		ownerId: "tab",
		locks: locksHeldBy(),
		upload: async (row) => {
			seen.push(row);
			if (row.id === first.id)
				persistSession("alice", {
					...later,
					revision: 2,
					state: "finished",
					endedAt: later.segments[0]?.endedAt ?? later.startedAt,
				});
			return { runId: crypto.randomUUID() };
		},
	});
	expect(seen[1]).toMatchObject({
		id: later.id,
		revision: 2,
		state: "finished",
	});
	expect(pendingSessions("alice")).toHaveLength(0);
});
