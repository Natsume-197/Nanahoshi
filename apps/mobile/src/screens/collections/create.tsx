import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/button";
import { Icon, type IconName, icons } from "@/components/icon";
import { SheetBody } from "@/components/sheet-body";
import { FormSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { Toggle } from "@/components/toggle";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";

/** The web's "Create collection" dialog as a native sheet: first manual or
 * dynamic, then the manual form here, or the rules editor for dynamic. */
export function CreateCollection() {
	const [step, setStep] = useState<"choose" | "manual">("choose");
	if (step === "choose") {
		return (
			<SheetBody title={t("collection.create_title")}>
				<KindOption
					icon={icons.collection}
					title={t("collection.create_manual_title")}
					description={t("collection.create_manual_desc")}
					onPress={() => setStep("manual")}
				/>
				<KindOption
					icon={icons.filter}
					title={t("collection.create_dynamic_title")}
					description={t("collection.create_dynamic_desc")}
					// The rules editor needs the whole screen, not this sheet.
					onPress={() => router.replace("/collection/dynamic/new")}
				/>
			</SheetBody>
		);
	}
	return <CreateManual />;
}

function CreateManual() {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const create = useMutation({
		...orpc.collections.create.mutationOptions(),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: orpc.collections.key() });
			// Finish the task and land on what was made; back returns to the list.
			router.dismissTo("/collections");
			if (created && typeof created === "object" && "id" in created) {
				router.push(routes.collection(String(created.id)));
			}
		},
	});

	return (
		<CollectionForm
			title={t("collection.create_manual_title")}
			description={t("collection.create_desc")}
			initialName=""
			initialPublic={false}
			showPublic
			submitLabel={t("common.create")}
			pending={create.isPending}
			error={create.error?.message ?? null}
			onSubmit={({ name, isPublic }) =>
				create.mutate({ name, isPublic, kind: "manual" })
			}
		/>
	);
}

function KindOption({
	icon,
	title,
	description,
	onPress,
}: {
	icon: IconName;
	title: string;
	description: string;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.lg,
				borderRadius: radius.field,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surface
						: "transparent",
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: radius.field,
					borderCurve: "continuous",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.accentSoft,
				}}
			>
				<Icon name={icon} size={20} color={palette.accent} />
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="label">{title}</Text>
				<Text variant="subhead" tone="secondary">
					{description}
				</Text>
			</View>
			<Icon name={icons.chevronRight} size={16} color={palette.textSecondary} />
		</Pressable>
	);
}

/** Same sheet to edit a manual collection: rename and switch visibility.
 * Dynamic ones open the rules editor instead. */
export function EditCollection({ id }: { id: string }) {
	const { orpc } = useApi();
	const details = useQuery(
		orpc.collections.getDetails.queryOptions({ input: { collectionId: id } }),
	);
	if (details.isPending) return <FormSkeleton fields={2} />;
	const collection = details.data?.collection;
	if (details.error || !collection) {
		return <ErrorState onRetry={() => details.refetch()} />;
	}
	return <EditForm collection={collection} />;
}

function EditForm({
	collection,
}: {
	collection: {
		id: string;
		name: string;
		isPublic: boolean;
		kind: "manual" | "dynamic";
	};
}) {
	const { orpc, client } = useApi();
	const queryClient = useQueryClient();
	const can = useCan();
	const showPublic =
		collection.kind === "manual" && can("collection", "makePublic");
	const save = useMutation({
		mutationFn: async ({
			name,
			isPublic,
		}: {
			name: string;
			isPublic: boolean;
		}) => {
			if (name !== collection.name) {
				await client.collections.rename({ collectionId: collection.id, name });
			}
			if (showPublic && isPublic !== collection.isPublic) {
				await client.collections.updateVisibility({
					collectionId: collection.id,
					isPublic,
				});
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.collections.key() });
			router.back();
		},
	});

	return (
		<CollectionForm
			title={t("mobile.collection.edit_title")}
			initialName={collection.name}
			initialPublic={collection.isPublic}
			showPublic={showPublic}
			submitLabel={t("common.save")}
			pending={save.isPending}
			error={save.error ? t("toast.collection_update_failed") : null}
			onSubmit={(values) => save.mutate(values)}
		/>
	);
}

function CollectionForm({
	title,
	description,
	initialName,
	initialPublic,
	showPublic,
	submitLabel,
	pending,
	error,
	onSubmit,
}: {
	title: string;
	description?: string;
	initialName: string;
	initialPublic: boolean;
	showPublic: boolean;
	submitLabel: string;
	pending: boolean;
	error: string | null;
	onSubmit: (values: { name: string; isPublic: boolean }) => void;
}) {
	const palette = usePalette();
	const nameRef = useRef(initialName);
	const [isPublic, setIsPublic] = useState(initialPublic);
	const [nameMissing, setNameMissing] = useState(false);

	const submit = () => {
		const name = nameRef.current.trim();
		setNameMissing(!name);
		if (name) onSubmit({ name, isPublic });
	};
	const message = nameMissing ? t("collection.dynamic_name_required") : error;

	return (
		<SheetBody title={title} description={description}>
			<TextField
				label={t("collection.name_label")}
				placeholder={t("collection.create_placeholder")}
				defaultValue={initialName}
				onChangeText={(text) => {
					nameRef.current = text;
				}}
				maxLength={80}
				autoFocus
				selectTextOnFocus={!!initialName}
				returnKeyType="done"
				onSubmitEditing={submit}
			/>
			{showPublic ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: space.md,
						padding: space.lg,
						borderRadius: radius.field,
						borderWidth: 1,
						borderColor: palette.separator,
					}}
				>
					<View style={{ flex: 1, gap: 2 }}>
						<Text variant="label">{t("collection.public_title")}</Text>
						<Text variant="subhead" tone="secondary">
							{t("collection.public_desc")}
						</Text>
					</View>
					<Toggle value={isPublic} onValueChange={setIsPublic} />
				</View>
			) : null}
			{message ? (
				<Text
					variant="subhead"
					tone="danger"
					selectable
					accessibilityLiveRegion="polite"
				>
					{message}
				</Text>
			) : null}
			<Button label={submitLabel} onPress={submit} loading={pending} />
		</SheetBody>
	);
}
