import type { IconName } from "../icon-names";

export type MenuItem = {
	id: string;
	label: string;
	icon: IconName;
	destructive?: boolean;
	onPress: () => void;
};

export type ActionMenuButtonProps = {
	/** Groups render as the platform's separated menu sections. */
	sections: MenuItem[][];
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
