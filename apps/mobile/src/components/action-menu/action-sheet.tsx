import {
	AnimatedVisibility,
	Box,
	Column,
	EnterTransition,
	ExitTransition,
	HorizontalDivider,
	RNHostView,
} from "@expo/ui/jetpack-compose";
import {
	animateContentSize,
	fillMaxWidth,
	padding,
} from "@expo/ui/jetpack-compose/modifiers";
import { type ReactElement, type ReactNode, useState } from "react";
import { usePalette } from "@/theme";
import { type IconName, icons } from "../icon-names";
import { Sheet } from "../sheet";
import { SheetHeader, SheetRow } from "../sheet/rows";
import { MaterialIcon } from "./material-icon";
import type { MenuGroup, MenuItem } from "./types";

/** A sheet row; the icon is optional (a plain list of choices has none). */
export type SheetItem = Omit<MenuItem, "icon"> & {
	icon?: IconName;
	/** RN content in the icon's place. */
	leading?: ReactElement;
	/** The current value of a pick-one list: trailing check. */
	selected?: boolean;
};

/** A row that opens a page of its own inside the sheet. */
export type SheetGroup = Omit<MenuGroup, "sections"> & {
	sections: SheetItem[][];
};
type SheetEntry = SheetItem | SheetGroup;
const isGroup = (entry: SheetEntry): entry is SheetGroup => "sections" in entry;

// Material's shared X axis: the page slides in from the side it lives on.
const forward = {
	enter: EnterTransition.slideInHorizontally({ initialOffsetX: 0.25 }).plus(
		EnterTransition.fadeIn(),
	),
	exit: ExitTransition.slideOutHorizontally({ targetOffsetX: 0.25 }).plus(
		ExitTransition.fadeOut(),
	),
};
const backward = {
	enter: EnterTransition.slideInHorizontally({ initialOffsetX: -0.25 }).plus(
		EnterTransition.fadeIn(),
	),
	exit: ExitTransition.slideOutHorizontally({ targetOffsetX: -0.25 }).plus(
		ExitTransition.fadeOut(),
	),
};

/**
 * A Material bottom sheet of actions (the Play Books / YT Music pattern).
 * A group row (›) swaps the sheet to its own page with a back row on top,
 * and the sheet resizes to it. Mount it where it's open, outside native
 * header views: a Compose host there never gets a window to attach the
 * sheet to.
 */
export function ActionSheet({
	sections,
	header,
	onClose,
}: {
	sections: SheetEntry[][];
	/** Compose content above the actions (what the sheet acts on). */
	header?: ReactNode;
	onClose: () => void;
}) {
	const palette = usePalette();
	const [page, setPage] = useState<string | null>(null);
	const groups = sections.flat().filter(isGroup);
	return (
		<Sheet expanded onClose={onClose}>
			{(dismiss) => {
				// Let the sheet slide away before the action navigates.
				const choose = (item: SheetItem) => dismiss(item.onPress);
				return (
					<Box
						modifiers={[
							fillMaxWidth(),
							padding(0, 0, 0, 12),
							animateContentSize(),
						]}
					>
						<AnimatedVisibility
							visible={page === null}
							enterTransition={backward.enter}
							exitTransition={backward.exit}
						>
							<Column modifiers={[fillMaxWidth()]}>
								{header}
								<Sections
									sections={sections}
									divideFirst={!!header}
									onChoose={choose}
									onOpen={setPage}
								/>
							</Column>
						</AnimatedVisibility>
						{groups.map((group) => (
							<AnimatedVisibility
								key={group.id}
								visible={page === group.id}
								enterTransition={forward.enter}
								exitTransition={forward.exit}
							>
								<Column modifiers={[fillMaxWidth()]}>
									<SheetHeader
										title={group.label}
										leading={
											<MaterialIcon name={icons.back} tint={palette.text} />
										}
										onPress={() => setPage(null)}
									/>
									<Sections
										sections={group.sections}
										divideFirst
										onChoose={choose}
										onOpen={setPage}
									/>
								</Column>
							</AnimatedVisibility>
						))}
					</Box>
				);
			}}
		</Sheet>
	);
}

function Sections({
	sections,
	divideFirst,
	onChoose,
	onOpen,
}: {
	sections: SheetEntry[][];
	divideFirst: boolean;
	onChoose: (item: SheetItem) => void;
	onOpen: (group: string) => void;
}) {
	const palette = usePalette();
	return sections.map((section, index) => (
		<Column key={section[0].id} modifiers={[fillMaxWidth()]}>
			{divideFirst || index > 0 ? (
				<HorizontalDivider color={palette.separator} />
			) : null}
			{section.map((entry) => {
				const danger = !isGroup(entry) && entry.destructive;
				return (
					<SheetRow
						key={entry.id}
						icon={entry.icon}
						leading={
							!isGroup(entry) && entry.leading ? (
								<RNHostView matchContents>{entry.leading}</RNHostView>
							) : undefined
						}
						iconTint={danger ? palette.danger : undefined}
						title={entry.label}
						titleColor={danger ? palette.danger : undefined}
						trailing={
							isGroup(entry) ? (
								<MaterialIcon
									name={icons.chevronRight}
									tint={palette.textSecondary}
								/>
							) : entry.selected ? (
								<MaterialIcon name={icons.check} tint={palette.text} />
							) : undefined
						}
						onPress={() =>
							isGroup(entry) ? onOpen(entry.id) : onChoose(entry)
						}
					/>
				);
			})}
		</Column>
	));
}
