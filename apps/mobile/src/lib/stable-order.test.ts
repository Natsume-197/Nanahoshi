import { expect, test } from "bun:test";
import { inSeenOrder } from "./stable-order";

const ids = (list: { id: string }[]) => list.map((item) => item.id);

test("a re-sorted answer keeps the rows where they were", () => {
	const resorted = [{ id: "wrong" }, { id: "likes" }, { id: "club" }];
	expect(ids(inSeenOrder(resorted, ["likes", "club", "wrong"]))).toEqual([
		"likes",
		"club",
		"wrong",
	]);
});

test("a collection made meanwhile goes last, one that is gone drops out", () => {
	const list = [{ id: "new" }, { id: "b" }];
	expect(ids(inSeenOrder(list, ["a", "b"]))).toEqual(["b", "new"]);
});
