import {
	AUDIOBOOK_METADATA_FIELDS,
	audiobookMetadataValues,
	BOOK_METADATA_FIELDS,
	bookMetadataValues,
	buildAudiobookMetadataUpdate,
	buildBookMetadataUpdate,
	dirtyKeys,
	dirtyLockKeys,
	type EditableAudiobook,
	type EditableBook,
	lockStateFor,
	type MetadataFieldDef,
	type MetadataLockState,
	type MetadataValues,
	unlockFieldsToSend,
} from "@nanahoshi/api/routers/books/metadata/metadata-edit-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { DateField } from "@/components/date-field";
import { HeaderButton } from "@/components/header-button";
import { Icon, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { showNotice } from "@/components/prompt";
import { FormSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { MediaKind } from "@/lib/routes";
import { audiobookDetailQueries, bookDetailQueries } from "@/lib/title-queries";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

/** The web's "Edit metadata" dialog as a full-screen form. Edited fields
 * lock against automatic enrichment; a locked field's padlock reopens it. */
export function EditMetadata({
	uuid,
	kind,
}: {
	uuid: string;
	kind: MediaKind;
}) {
	return kind === "audiobook" ? (
		<EditAudiobook uuid={uuid} />
	) : (
		<EditBook uuid={uuid} />
	);
}

function EditBook({ uuid }: { uuid: string }) {
	const { orpc, client } = useApi();
	const detail = useQuery(bookDetailQueries(orpc, uuid).detail);
	const save = useSave((input: ReturnType<typeof buildBookMetadataUpdate>) =>
		client.books.updateMetadata(input),
	);
	if (detail.isError) return <ErrorState onRetry={() => detail.refetch()} />;
	if (!detail.data) return <FormSkeleton fields={6} />;
	const book: EditableBook = {
		...detail.data,
		authors: detail.data.authors ?? [],
		genres: detail.data.genres ?? [],
		tags: detail.data.tags ?? [],
	};
	return (
		<MetadataForm
			fields={BOOK_METADATA_FIELDS}
			initial={bookMetadataValues(book)}
			lockedFields={book.lockedFields ?? []}
			saving={save.isPending}
			onSave={(values, unlockFields) =>
				save.mutate(buildBookMetadataUpdate(book, values, unlockFields))
			}
		/>
	);
}

function EditAudiobook({ uuid }: { uuid: string }) {
	const { orpc, client } = useApi();
	const detail = useQuery(audiobookDetailQueries(orpc, uuid).detail);
	const save = useSave(
		(input: ReturnType<typeof buildAudiobookMetadataUpdate>) =>
			client.audiobooks.updateMetadata(input),
	);
	if (detail.isError) return <ErrorState onRetry={() => detail.refetch()} />;
	if (!detail.data) return <FormSkeleton fields={6} />;
	const audiobook: EditableAudiobook = {
		...detail.data,
		authors: detail.data.authors ?? [],
		narrators: detail.data.narrators ?? [],
		genres: detail.data.genres ?? [],
		tags: detail.data.tags ?? [],
	};
	return (
		<MetadataForm
			fields={AUDIOBOOK_METADATA_FIELDS}
			initial={audiobookMetadataValues(audiobook)}
			lockedFields={audiobook.lockedFields ?? []}
			saving={save.isPending}
			onSave={(values, unlockFields) =>
				save.mutate(
					buildAudiobookMetadataUpdate(audiobook, values, unlockFields),
				)
			}
		/>
	);
}

function useSave<T>(send: (input: T) => Promise<unknown>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: send,
		onSuccess: async () => {
			haptics.success();
			// The title shows on its page, in lists, rails and search.
			await queryClient.invalidateQueries();
			router.back();
		},
		onError: (error) =>
			showNotice(error.message || t("toast.metadata_save_failed")),
	});
}

function MetadataForm({
	fields,
	initial,
	lockedFields,
	saving,
	onSave,
}: {
	fields: MetadataFieldDef[];
	initial: MetadataValues;
	lockedFields: string[];
	saving: boolean;
	onSave: (values: MetadataValues, unlockFields: string[]) => void;
}) {
	const [values, setValues] = useState(initial);
	const [pendingUnlocks, setPendingUnlocks] = useState<Set<string>>(
		() => new Set(),
	);
	const locked = new Set(lockedFields);
	const dirtyLocks = dirtyLockKeys(fields, dirtyKeys(fields, values, initial));
	const hasChanges = dirtyLocks.size > 0 || pendingUnlocks.size > 0;
	const toggleUnlock = (lockKey: string) =>
		setPendingUnlocks((previous) => {
			const next = new Set(previous);
			if (next.has(lockKey)) next.delete(lockKey);
			else next.add(lockKey);
			return next;
		});

	return (
		<>
			<Stack.Screen
				options={{
					title: t("book.edit_metadata"),
					headerLeft: () => (
						<HeaderButton label={t("common.cancel")} onPress={router.back} />
					),
					headerRight: () =>
						hasChanges ? (
							<HeaderButton
								label={t("common.save")}
								strong
								busy={saving}
								onPress={() =>
									onSave(values, unlockFieldsToSend(pendingUnlocks, dirtyLocks))
								}
							/>
						) : null,
				}}
			/>
			<ScrollView
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				automaticallyAdjustKeyboardInsets
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					padding: space.lg,
					gap: space.lg,
					paddingBottom: space.xxl * 2,
				}}
			>
				<Text variant="subhead" tone="secondary">
					{t("metadata.edit_description")}
				</Text>
				{fields.map((def) => (
					<Field
						key={def.key}
						def={def}
						value={values[def.key] ?? ""}
						onChange={(value) =>
							setValues((previous) => ({ ...previous, [def.key]: value }))
						}
						lock={lockStateFor(def.lockKey, locked, pendingUnlocks, dirtyLocks)}
						onToggleLock={() => toggleUnlock(def.lockKey)}
					/>
				))}
			</ScrollView>
		</>
	);
}

function Field({
	def,
	value,
	onChange,
	lock,
	onToggleLock,
}: {
	def: MetadataFieldDef;
	value: string;
	onChange: (value: string) => void;
	lock: MetadataLockState;
	onToggleLock: () => void;
}) {
	const label = def.label ?? t(def.labelKey);
	const accessory = <LockToggle state={lock} onPress={onToggleLock} />;
	if (def.kind === "date")
		return (
			<View style={{ gap: 8 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<Text variant="label">{label}</Text>
					{accessory}
				</View>
				<DateField value={value} label={label} onChange={onChange} />
			</View>
		);
	return (
		<View style={{ gap: space.xs }}>
			<TextField
				label={label}
				accessory={accessory}
				value={value}
				onChangeText={onChange}
				multiline={def.kind === "textarea"}
				keyboardType={def.kind === "number" ? "decimal-pad" : "default"}
				autoCapitalize={def.mono ? "characters" : "sentences"}
				autoCorrect={!def.mono}
				style={
					def.kind === "textarea"
						? {
								height: 140,
								paddingTop: 10,
								textAlignVertical: "top",
							}
						: undefined
				}
			/>
			{def.listHint ? (
				<Text variant="caption" tone="secondary">
					{t("metadata.list_hint")}
				</Text>
			) : null}
		</View>
	);
}

/** Locked: tap to reopen to enrichment on save. Edited: will lock. */
function LockToggle({
	state,
	onPress,
}: {
	state: MetadataLockState;
	onPress: () => void;
}) {
	const palette = usePalette();
	if (state === null) return null;
	if (state === "will-lock")
		return (
			<View accessible accessibilityLabel={t("metadata.will_lock_tooltip")}>
				<Icon name={icons.locked} size={14} color={palette.textSecondary} />
			</View>
		);
	const isLocked = state === "locked";
	const description = t(
		isLocked ? "metadata.locked_tooltip" : "metadata.unlock_pending_tooltip",
	);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={description}
			onPress={onPress}
			hitSlop={12}
		>
			<Icon
				name={isLocked ? icons.locked : icons.unlocked}
				size={16}
				color={isLocked ? palette.warning : palette.textSecondary}
			/>
		</Pressable>
	);
}
