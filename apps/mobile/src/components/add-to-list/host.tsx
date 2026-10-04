import {
	Checkbox,
	Column,
	HorizontalDivider,
	RadioButton,
	Text,
} from "@expo/ui/jetpack-compose";
import {
	fillMaxWidth,
	padding,
	verticalScroll,
} from "@expo/ui/jetpack-compose/modifiers";
import { t } from "@/lib/i18n";
import { shelfMeta } from "@/lib/shelves";
import { BUCKETS, useAddToList } from "@/screens/detail/add-to-list";
import { usePalette } from "@/theme";
import { Sheet } from "../sheet";
import { SheetRow, SheetTitle } from "../sheet/rows";
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
	return (
		<Sheet onClose={closeAddToList}>
			<Column
				modifiers={[fillMaxWidth(), verticalScroll(), padding(0, 0, 0, 24)]}
			>
				<SheetTitle>{t("add_to_list.title")}</SheetTitle>
				{BUCKETS.map((shelf) => {
					const meta = shelfMeta(shelf, target.kind);
					const selected = bucket === shelf;
					return (
						<SheetRow
							key={shelf}
							icon={meta.icon}
							iconTint={selected ? palette.accent : undefined}
							title={meta.label}
							trailing={
								<RadioButton
									selected={selected}
									onClick={() => pickShelf(shelf)}
									colors={{
										selectedColor: palette.accent,
										unselectedColor: palette.textTertiary,
									}}
								/>
							}
							onPress={() => pickShelf(shelf)}
						/>
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
							<SheetRow
								key={collection.id}
								title={collection.name}
								subtitle={t("media.item_count", {
									count: collection.bookCount,
								})}
								trailing={
									<Checkbox
										value={collection.inCollection}
										onCheckedChange={() => toggleCollection(collection)}
										colors={{
											checkedColor: palette.accent,
											checkmarkColor: palette.onPrimary,
											uncheckedColor: palette.textTertiary,
										}}
									/>
								}
								onPress={() => toggleCollection(collection)}
							/>
						))}
					</Column>
				) : null}
			</Column>
		</Sheet>
	);
}
