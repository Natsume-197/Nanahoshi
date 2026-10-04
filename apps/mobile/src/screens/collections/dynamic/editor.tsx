import { Host, Switch } from "@expo/ui";
import {
	applyTemplate,
	countRules,
	nextSortRule,
	templateFits,
} from "@nanahoshi/api/routers/collections/collection-rule-editing";
import {
	fieldLabel,
	templateLabel,
	valueLabel,
} from "@nanahoshi/api/routers/collections/collection-rule-labels";
import {
	DYNAMIC_COLLECTION_TEMPLATES,
	emptyDynamicCollectionDefinition,
} from "@nanahoshi/api/routers/collections/collection-rule-templates";
import {
	COLLECTION_RULE_LIMITS,
	COLLECTION_SORT_FIELDS,
	type CollectionSortRule,
	DynamicCollectionDefinitionSchema,
	type DynamicCollectionDefinitionV1,
	isPersonalizedCollectionDefinition,
} from "@nanahoshi/api/routers/collections/collection-rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	useColorScheme,
	View,
} from "react-native";
import { Button } from "@/components/button";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { MenuSelect } from "@/components/menu-select";
import { OptionSheet } from "@/components/option-sheet";
import { askChoice, showNotice } from "@/components/prompt";
import { ErrorState, Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useCan } from "@/lib/abilities";
import { locale, t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { GroupEditor } from "./rules";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PREVIEW_DELAY = 450;

type Submission = {
	name: string;
	description?: string;
	isPublic: boolean;
	definition: DynamicCollectionDefinitionV1;
};

export function CreateDynamicCollection() {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const create = useMutation({
		...orpc.collections.create.mutationOptions(),
		onError: () => showNotice(t("toast.collection_create_failed")),
	});
	return (
		<DynamicCollectionEditor
			title={t("collection.dynamic_editor_create_title")}
			description={t("collection.dynamic_editor_create_desc")}
			submitLabel={t("common.create")}
			pending={create.isPending}
			onSubmit={async (value) => {
				const created = await create.mutateAsync({ ...value, kind: "dynamic" });
				await queryClient.invalidateQueries({
					queryKey: orpc.collections.key(),
				});
				router.dismissTo("/collections");
				if (created && typeof created === "object" && "id" in created) {
					router.push(routes.collection(String(created.id)));
				}
			}}
		/>
	);
}

export function EditDynamicCollection({ id }: { id: string }) {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const details = useQuery(
		orpc.collections.getDetails.queryOptions({ input: { collectionId: id } }),
	);
	const update = useMutation({
		...orpc.collections.updateDefinition.mutationOptions(),
		onError: () => showNotice(t("toast.collection_update_failed")),
	});
	if (details.isPending) return <Spinner />;
	const collection = details.data?.collection;
	if (
		details.error ||
		!collection ||
		collection.kind !== "dynamic" ||
		!collection.isOwner
	) {
		return <ErrorState onRetry={() => details.refetch()} />;
	}
	return (
		<DynamicCollectionEditor
			title={t("collection.dynamic_editor_edit_title")}
			description={t("collection.dynamic_editor_edit_desc")}
			submitLabel={t("common.save")}
			pending={update.isPending}
			initial={
				collection.definitionStatus === "valid"
					? (collection.dynamicDefinition as DynamicCollectionDefinitionV1)
					: undefined
			}
			initialName={collection.name}
			initialDescription={collection.description}
			initialPublic={collection.isPublic}
			onSubmit={async (value) => {
				await update.mutateAsync({ collectionId: id, ...value });
				await queryClient.invalidateQueries({
					queryKey: orpc.collections.key(),
				});
				router.back();
			}}
		/>
	);
}

/** The web's dynamic collection editor as a full screen: a live preview,
 * the details, the rules and the order. Leaving with changes asks first. */
function DynamicCollectionEditor({
	title,
	description: screenDescription,
	submitLabel,
	pending,
	initial,
	initialName = "",
	initialDescription,
	initialPublic = false,
	onSubmit,
}: {
	title: string;
	description: string;
	submitLabel: string;
	pending: boolean;
	initial?: DynamicCollectionDefinitionV1;
	initialName?: string;
	initialDescription?: string | null;
	initialPublic?: boolean;
	onSubmit: (value: Submission) => Promise<void>;
}) {
	const palette = usePalette();
	const scheme = useColorScheme();
	const navigation = useNavigation();
	const can = useCan();
	const [baseline] = useState(
		() => initial ?? emptyDynamicCollectionDefinition(),
	);
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription ?? "");
	const [isPublic, setIsPublic] = useState(initialPublic);
	const [definition, setDefinition] = useState(baseline);
	const [previewed, setPreviewed] = useState(baseline);
	const [showErrors, setShowErrors] = useState(false);
	const [quickFilters, setQuickFilters] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const parsed = DynamicCollectionDefinitionSchema.safeParse(definition);
	const isDirty =
		name !== initialName ||
		description !== (initialDescription ?? "") ||
		isPublic !== initialPublic ||
		JSON.stringify(definition) !== JSON.stringify(baseline);
	const canAddRule =
		countRules(definition.root) < COLLECTION_RULE_LIMITS.maxRules;
	const valid = parsed.success && name.trim().length > 0;

	// The preview follows the rules a moment after the last edit.
	const edit = (next: DynamicCollectionDefinitionV1) => {
		setDefinition(next);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setPreviewed(next), PREVIEW_DELAY);
	};

	usePreventRemove(isDirty && !leaving, ({ data }) => {
		void askChoice({
			title: t("collection.dynamic_leave_confirm"),
			options: [{ id: "leave", label: t("common.close"), destructive: true }],
		}).then((answer) => {
			if (answer === "leave") navigation.dispatch(data.action);
		});
	});

	const submit = async () => {
		if (!parsed.success || !name.trim()) {
			setShowErrors(true);
			return;
		}
		setLeaving(true);
		try {
			await onSubmit({
				name: name.trim(),
				description: description.trim() || undefined,
				isPublic,
				definition: parsed.data,
			});
		} catch {
			setLeaving(false);
		}
	};

	const sortSummary = definition.sort
		.map(
			(sort) =>
				`${fieldLabel(sort.field, locale)} · ${valueLabel(sort.direction, locale)}`,
		)
		.join(", ");

	return (
		<>
			<Stack.Screen
				options={{
					title,
					headerLeft: () => (
						<HeaderButton label={t("common.cancel")} onPress={router.back} />
					),
					headerRight: () => (
						<HeaderButton
							label={submitLabel}
							strong
							busy={pending}
							onPress={() => void submit()}
						/>
					),
				}}
			/>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				automaticallyAdjustKeyboardInsets
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					padding: space.lg,
					gap: space.xl,
					paddingBottom: space.xxl * 2,
				}}
			>
				<Text variant="subhead" tone="secondary">
					{screenDescription}
				</Text>

				{showErrors && !valid ? (
					<Text variant="subhead" tone="danger" accessibilityRole="alert">
						{t("collection.dynamic_form_error")}
					</Text>
				) : null}

				<Preview
					definition={
						DynamicCollectionDefinitionSchema.safeParse(previewed).success
							? previewed
							: null
					}
					waiting={!parsed.success}
				/>

				<Section
					title={t("collection.dynamic_details_title")}
					description={t("collection.dynamic_details_desc")}
				>
					<View style={{ gap: space.xs }}>
						<TextField
							label={t("collection.name_label")}
							placeholder={t("collection.dynamic_name_help")}
							defaultValue={initialName}
							onChangeText={setName}
							maxLength={80}
						/>
						{showErrors && !name.trim() ? (
							<Text variant="caption" tone="danger">
								{t("collection.dynamic_name_required")}
							</Text>
						) : null}
					</View>
					<TextField
						label={t("collection.dynamic_description_label")}
						defaultValue={initialDescription ?? ""}
						onChangeText={setDescription}
						maxLength={280}
						multiline
						style={{ minHeight: 72, textAlignVertical: "top" }}
					/>
					{can("collection", "makePublic") ? (
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
									{t("collection.dynamic_public_help")}
								</Text>
							</View>
							<Host
								matchContents
								colorScheme={scheme === "dark" ? "dark" : "light"}
							>
								<Switch value={isPublic} onValueChange={setIsPublic} />
							</Host>
						</View>
					) : null}
					{isPublic &&
					parsed.success &&
					isPersonalizedCollectionDefinition(parsed.data) ? (
						<View style={{ flexDirection: "row", gap: space.sm }}>
							<Icon
								name={icons.warning}
								size={16}
								color={palette.textSecondary}
							/>
							<Text variant="subhead" tone="secondary" style={{ flex: 1 }}>
								{t("collection.public_personal_desc")}
							</Text>
						</View>
					) : null}
				</Section>

				<Section
					title={`${t("collection.dynamic_rules_title")} · ${countRules(definition.root)}`}
					description={t("collection.dynamic_rules_desc")}
				>
					<Button
						variant="outline"
						label={t("collection.dynamic_quick_filters")}
						icon={<Icon name={icons.whatsNew} size={16} color={palette.text} />}
						onPress={() => setQuickFilters(true)}
					/>
					<GroupEditor
						group={definition.root}
						depth={1}
						canAddRule={canAddRule}
						onChange={(root) => edit({ ...definition, root })}
					/>
				</Section>

				<OrderSection
					summary={sortSummary}
					value={definition.sort}
					onChange={(sort) => edit({ ...definition, sort })}
				/>
			</ScrollView>
			{quickFilters ? (
				<OptionSheet
					title={t("collection.dynamic_quick_filters")}
					description={t("collection.dynamic_quick_filters_desc")}
					searchPlaceholder={t("collection.dynamic_search_quick_filters")}
					emptyLabel={t("collection.dynamic_no_options")}
					sections={[
						{
							options: DYNAMIC_COLLECTION_TEMPLATES.map((template) => ({
								value: template.id,
								label: templateLabel(template.id, locale),
								disabled: !templateFits(definition, template.definition),
								badge: template.definition.root.children.some(
									(child) => child.kind === "group",
								)
									? t("collection.dynamic_uses_groups")
									: undefined,
							})),
						},
					]}
					onSelect={(id) => {
						const template = DYNAMIC_COLLECTION_TEMPLATES.find(
							(item) => item.id === id,
						);
						if (template) edit(applyTemplate(definition, template.definition));
						setQuickFilters(false);
					}}
					onClose={() => setQuickFilters(false)}
				/>
			) : null}
		</>
	);
}

function HeaderButton({
	label,
	strong,
	busy,
	onPress,
}: {
	label: string;
	strong?: boolean;
	busy?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	if (busy) return <ActivityIndicator color={palette.text} />;
	return (
		<Pressable
			onPress={onPress}
			hitSlop={10}
			accessibilityRole="button"
			style={{ paddingHorizontal: space.xs }}
		>
			<Text
				variant="body"
				style={{
					color: strong ? palette.accent : palette.text,
					fontWeight: strong ? "600" : "400",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<View style={{ gap: space.md }}>
			<View style={{ gap: space.xs }}>
				<Text variant="section" accessibilityRole="header">
					{title}
				</Text>
				{description ? (
					<Text variant="subhead" tone="secondary">
						{description}
					</Text>
				) : null}
			</View>
			{children}
		</View>
	);
}

/** How many titles match right now, with a few covers and names. */
function Preview({
	definition,
	waiting,
}: {
	definition: DynamicCollectionDefinitionV1 | null;
	waiting: boolean;
}) {
	const { orpc } = useApi();
	const palette = usePalette();
	const preview = useQuery({
		...orpc.collections.previewDefinition.queryOptions({
			input: {
				definition: definition ?? emptyDynamicCollectionDefinition(),
				limit: 6,
				timeZone: TIME_ZONE,
			},
		}),
		enabled: definition !== null && !waiting,
		staleTime: 10_000,
		gcTime: 0,
	});
	const sample = preview.data?.sample ?? [];

	let body: React.ReactNode;
	if (waiting) {
		body = (
			<Text variant="subhead" tone="secondary">
				{t("collection.dynamic_preview_waiting")}
			</Text>
		);
	} else if (preview.isFetching) {
		body = (
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
			>
				<ActivityIndicator color={palette.textSecondary} />
				<Text variant="subhead" tone="secondary">
					{t("collection.dynamic_preview_updating")}
				</Text>
			</View>
		);
	} else if (preview.isError) {
		body = (
			<Text variant="subhead" tone="danger">
				{t("collection.dynamic_preview_error")}
			</Text>
		);
	} else if ((preview.data?.count ?? 0) === 0) {
		body = (
			<View style={{ gap: 2 }}>
				<Text variant="label">{t("collection.dynamic_preview_empty")}</Text>
				<Text variant="subhead" tone="secondary">
					{t("collection.dynamic_preview_empty_desc")}
				</Text>
			</View>
		);
	} else {
		body = (
			<View style={{ gap: space.md }}>
				<View style={{ gap: 2 }}>
					<Text variant="title" style={{ fontVariant: ["tabular-nums"] }}>
						{t("collection.dynamic_preview_count", {
							count: preview.data?.count ?? 0,
						})}
					</Text>
					<Text variant="caption" tone="secondary">
						{t("collection.dynamic_preview_sample")}
					</Text>
				</View>
				<View style={{ flexDirection: "row", gap: space.sm }}>
					{sample.slice(0, 4).map((book) => (
						<Cover
							key={book.uuid}
							cover={book.cover}
							color={book.mainColor}
							width={48}
						/>
					))}
				</View>
				<View style={{ gap: 2 }}>
					{sample.slice(0, 3).map((book) => (
						<Text key={book.uuid} variant="subhead" numberOfLines={1}>
							{book.title ?? book.filename}
						</Text>
					))}
				</View>
			</View>
		);
	}

	return (
		<View
			accessibilityLiveRegion="polite"
			style={{
				gap: space.md,
				padding: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<Text variant="metaLabel" tone="secondary">
				{t("collection.dynamic_preview_title")}
			</Text>
			{body}
		</View>
	);
}

function OrderSection({
	summary,
	value,
	onChange,
}: {
	summary: string;
	value: CollectionSortRule[];
	onChange: (value: CollectionSortRule[]) => void;
}) {
	const palette = usePalette();
	const [open, setOpen] = useState(false);
	const next = nextSortRule(value);
	return (
		<View style={{ gap: space.md }}>
			<Pressable
				onPress={() => setOpen(!open)}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
			>
				<View style={{ flex: 1, gap: space.xs }}>
					<Text variant="section" accessibilityRole="header">
						{t("collection.dynamic_order_title")}
					</Text>
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						{summary}
					</Text>
				</View>
				<Text variant="label" tone="secondary">
					{t("collection.dynamic_change_order")}
				</Text>
				<Icon
					name={open ? icons.moveUp : icons.collapse}
					size={14}
					color={palette.textSecondary}
				/>
			</Pressable>
			{open ? (
				<View style={{ gap: space.md }}>
					<Text variant="subhead" tone="secondary">
						{t("collection.dynamic_order_desc")}
					</Text>
					{value.map((sort, index) => (
						<View
							key={sort.field}
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: space.sm,
							}}
						>
							<MenuSelect
								flex={3}
								value={sort.field}
								options={COLLECTION_SORT_FIELDS.filter(
									(field) =>
										field === sort.field ||
										!value.some((item) => item.field === field),
								).map((field) => ({
									value: field,
									label: fieldLabel(field, locale),
								}))}
								onChange={(field) =>
									onChange(
										value.map((item, i) =>
											i === index ? { ...item, field } : item,
										),
									)
								}
							/>
							<MenuSelect
								flex={2}
								value={sort.direction}
								options={(["asc", "desc"] as const).map((direction) => ({
									value: direction,
									label: valueLabel(direction, locale),
								}))}
								onChange={(direction) =>
									onChange(
										value.map((item, i) =>
											i === index ? { ...item, direction } : item,
										),
									)
								}
							/>
							<Pressable
								onPress={() => onChange(value.filter((_, i) => i !== index))}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel={t("collection.dynamic_remove_sort")}
								style={{ padding: space.xs }}
							>
								<Icon
									name={icons.trash}
									size={18}
									color={palette.textSecondary}
								/>
							</Pressable>
						</View>
					))}
					{next ? (
						<Button
							variant="outline"
							label={t("collection.dynamic_add_sort")}
							icon={<Icon name={icons.plus} size={16} color={palette.text} />}
							onPress={() => onChange([...value, next])}
						/>
					) : null}
				</View>
			) : null}
		</View>
	);
}
