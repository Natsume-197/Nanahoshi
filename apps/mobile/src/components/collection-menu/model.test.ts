import { describe, expect, it } from "bun:test";
import { type CollectionTarget, collectionActions } from "./model";

const mine: CollectionTarget = {
	id: "c1",
	name: "Favoritos",
	isPublic: false,
	kind: "manual",
	isOwner: true,
};
const all = () => true;

describe("collectionActions", () => {
	it("gives the owner edit and visibility, with delete set apart", () => {
		expect(collectionActions(mine, all)).toEqual([
			["offline"],
			["edit", "visibility"],
			["delete"],
		]);
	});

	it("lets anyone keep someone else's collection offline, nothing more", () => {
		expect(collectionActions({ ...mine, isOwner: false }, all)).toEqual([
			["offline"],
		]);
	});

	it("leaves a dynamic collection's visibility to its rules", () => {
		expect(collectionActions({ ...mine, kind: "dynamic" }, all)).toEqual([
			["offline"],
			["edit"],
			["delete"],
		]);
	});

	it("drops what the member's role doesn't allow", () => {
		const onlyDelete = (_: string, action: string) => action === "delete";
		expect(collectionActions(mine, onlyDelete)).toEqual([
			["offline"],
			["delete"],
		]);
	});
});
