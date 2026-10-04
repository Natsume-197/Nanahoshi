import { describe, expect, test } from "bun:test";
import { createChoiceStore, createNoticeStore } from "./store";

const request = {
	title: "Delete?",
	options: [{ id: "delete", label: "Delete", destructive: true }],
};

describe("choices", () => {
	test("the picked row is the answer", async () => {
		const store = createChoiceStore();
		const answer = store.ask(request);
		store.answer("delete");
		expect(await answer).toBe("delete");
		expect(store.get()).toBeNull();
	});

	test("the sheet closing after a pick doesn't overwrite the pick", async () => {
		const store = createChoiceStore();
		const answer = store.ask(request);
		store.answer("delete");
		store.answer(null);
		expect(await answer).toBe("delete");
	});

	test("a new question dismisses the open one", async () => {
		const store = createChoiceStore();
		const first = store.ask(request);
		const second = store.ask({ ...request, title: "Other?" });
		expect(await first).toBeNull();
		expect(store.get()?.title).toBe("Other?");
		store.answer(null);
		expect(await second).toBeNull();
	});
});

describe("notices", () => {
	test("a notice clears itself, and a newer one keeps its own time", async () => {
		const store = createNoticeStore(20);
		store.show("first");
		await Bun.sleep(12);
		store.show("second");
		await Bun.sleep(12);
		expect(store.get()?.message).toBe("second");
		await Bun.sleep(15);
		expect(store.get()).toBeNull();
	});

	test("an action notice stays longer and runs its action once", async () => {
		const store = createNoticeStore(20);
		let undone = 0;
		store.show("hidden", { label: "Undo", onPress: () => undone++ });
		await Bun.sleep(30);
		const notice = store.get();
		expect(notice?.action?.label).toBe("Undo");
		store.act(notice?.id ?? -1);
		store.act(notice?.id ?? -1);
		expect(undone).toBe(1);
		expect(store.get()).toBeNull();
	});

	test("acting on a replaced notice does nothing", () => {
		const store = createNoticeStore(20);
		let undone = 0;
		store.show("old", { label: "Undo", onPress: () => undone++ });
		const stale = store.get()?.id ?? -1;
		store.show("new");
		store.act(stale);
		expect(undone).toBe(0);
		expect(store.get()?.message).toBe("new");
	});
});
