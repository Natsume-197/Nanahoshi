import { expect, test } from "bun:test";
import { icons } from "../icon-names";
import { flattenMenu, type MenuEntry } from "./types";

const item = (id: string) => ({
	id,
	label: id,
	icon: icons.info,
	onPress: () => {},
});

test("dropdowns show a group's actions as their own section, in place", () => {
	const sections: MenuEntry[][] = [
		[
			item("details"),
			{
				id: "share",
				label: "Share",
				icon: icons.share,
				sections: [[item("link"), item("file")]],
			},
			item("remove"),
		],
		[item("delete")],
	];
	expect(
		flattenMenu(sections).map((section) => section.map((entry) => entry.id)),
	).toEqual([["details"], ["link", "file"], ["remove"], ["delete"]]);
});
