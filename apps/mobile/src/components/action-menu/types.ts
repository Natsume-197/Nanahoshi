import type { IconName } from "../icon-names";

export type MenuItem = {
	id: string;
	label: string;
	icon: IconName;
	destructive?: boolean;
	onPress: () => void;
};

/** A row that opens a page of its own inside the sheet (a submenu in
 * UIMenu; dropdowns show its actions inline). */
export type MenuGroup = {
	id: string;
	label: string;
	icon: IconName;
	sections: MenuItem[][];
};

export type MenuEntry = MenuItem | MenuGroup;

export const isMenuGroup = (entry: MenuEntry): entry is MenuGroup =>
	"sections" in entry;

/** Dropdowns have no pages: each group becomes a section where it stood. */
export function flattenMenu(sections: MenuEntry[][]): MenuItem[][] {
	return sections.flatMap((section) => {
		const out: MenuItem[][] = [[]];
		for (const entry of section) {
			if (!isMenuGroup(entry)) {
				out[out.length - 1].push(entry);
				continue;
			}
			out.push(...entry.sections, []);
		}
		return out.filter((part) => part.length > 0);
	});
}

export type ActionMenuButtonProps = {
	/** Groups render as the platform's separated menu sections. */
	sections: MenuEntry[][];
	label: string;
	icon: IconName;
	color: string;
	/** Glyph size; the tap target is always `box` square. */
	size?: number;
	box?: number;
	/** A filled rounded square (detail pages); glyph-only when omitted. */
	background?: string;
	radius?: number;
};
