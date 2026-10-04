import { Host } from "@expo/ui";
import {
	Checkbox,
	Column,
	HorizontalDivider,
	ListItem,
	ModalBottomSheet,
	RadioButton,
	Text,
} from "@expo/ui/jetpack-compose";
import {
	clickable,
	fillMaxWidth,
	padding,
	verticalScroll,
} from "@expo/ui/jetpack-compose/modifiers";
import { t } from "@/lib/i18n";
import { shelfMeta } from "@/lib/shelves";
import { BUCKETS, useAddToList } from "@/screens/detail/add-to-list";
import { usePalette } from "@/theme";
import { MaterialIcon } from "../action-menu/material-icon";
import {
	type AddToListTarget,
	closeAddToList,
	useAddToListTarget,
} from "./open";

/** Mounts the app's one "Add to list" Material sheet while it's open. */
export function AddToListHost() {
	const target = useAddToListTarget();
	if (!target) return null;
	return <AddToListSheet key={target.uuid} target={target} />;
}

/**
 * The same Material bottom sheet as the title's ⋮ menu: the reading shelf as
 * radio rows, then manual collections as checkbox rows. Every tap saves and
 * the sheet stays open, so several lists can be picked in one go.
 */
function AddToListSheet({ target }: { target: AddToListTarget }) {
	const palette = usePalette();
	const { bucket, collections, pickShelf, toggleCollection } = useAddToList(
		target.uuid,
		target.kind,
	);
	const rowColors = { containerColor: palette.card };
	return (
		<Host style={{ position: "absolute", width: 1, height: 1 }}>
			<ModalBottomSheet
				onDismissRequest={closeAddToList}
				containerColor={palette.card}
				contentColor={palette.text}
			>
				<Column
					modifiers={[fillMaxWidth(), verticalScroll(), padding(0, 0, 0, 24)]}
				>
					<Text
						color={palette.text}
						style={{ typography: "titleLarge" }}
						modifiers={[padding(24, 4, 24, 12)]}
					>
						{t("add_to_list.title")}
					</Text>
					{BUCKETS.map((shelf) => {
						const meta = shelfMeta(shelf, target.kind);
						const selected = bucket === shelf;
						return (
							<ListItem
								key={shelf}
								colors={rowColors}
								modifiers={[clickable(() => pickShelf(shelf))]}
							>
								<ListItem.LeadingContent>
									<MaterialIcon
										name={meta.icon}
										tint={selected ? palette.accent : palette.textSecondary}
									/>
								</ListItem.LeadingContent>
								<ListItem.HeadlineContent>
									<Text
										color={palette.text}
										style={{ typography: "bodyLarge" }}
									>
										{meta.label}
									</Text>
								</ListItem.HeadlineContent>
								<ListItem.TrailingContent>
									<RadioButton
										selected={selected}
										onClick={() => pickShelf(shelf)}
										colors={{
											selectedColor: palette.accent,
											unselectedColor: palette.textTertiary,
										}}
									/>
								</ListItem.TrailingContent>
							</ListItem>
						);
					})}
					{collections.length > 0 ? (
						<Column modifiers={[fillMaxWidth()]}>
							<HorizontalDivider color={palette.separator} />
							<Text
								color={palette.textSecondary}
								style={{ typography: "labelLarge" }}
								modifiers={[padding(24, 16, 24, 4)]}
							>
								{t("nav.collections")}
							</Text>
							{collections.map((collection) => (
								<ListItem
									key={collection.id}
									colors={rowColors}
									modifiers={[clickable(() => toggleCollection(collection))]}
								>
									<ListItem.HeadlineContent>
										<Text
											color={palette.text}
											style={{ typography: "bodyLarge" }}
										>
											{collection.name}
										</Text>
									</ListItem.HeadlineContent>
									<ListItem.SupportingContent>
										<Text
											color={palette.textSecondary}
											style={{ typography: "bodyMedium" }}
										>
											{t("media.item_count", { count: collection.bookCount })}
										</Text>
									</ListItem.SupportingContent>
									<ListItem.TrailingContent>
										<Checkbox
											value={collection.inCollection}
											onCheckedChange={() => toggleCollection(collection)}
											colors={{
												checkedColor: palette.accent,
												checkmarkColor: palette.onPrimary,
												uncheckedColor: palette.textTertiary,
											}}
										/>
									</ListItem.TrailingContent>
								</ListItem>
							))}
						</Column>
					) : null}
				</Column>
			</ModalBottomSheet>
		</Host>
	);
}
