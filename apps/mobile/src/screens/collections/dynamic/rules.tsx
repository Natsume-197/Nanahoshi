import {
	appendChild,
	defaultRule,
	type EntityField,
	emptyGroup,
	isRuleComplete,
	moveChild,
	removeChild,
	replaceChild,
	ruleInputKind,
	withOperator,
} from "@nanahoshi/api/routers/collections/collection-rule-editing";
import {
	COLLECTION_FIELD_GROUPS,
	fieldLabel,
	operatorLabel,
	valueLabel,
} from "@nanahoshi/api/routers/collections/collection-rule-labels";
import {
	COLLECTION_ENUM_VALUES,
	COLLECTION_FIELD_OPERATORS,
	COLLECTION_RULE_LIMITS,
	type CollectionEntityRef,
	type CollectionFieldRule,
	type CollectionRuleField,
	type CollectionRuleGroup,
	type CollectionRuleOperator,
	type CollectionRuleValue,
} from "@nanahoshi/api/routers/collections/collection-rules";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import { ActionMenuButton, type MenuItem } from "@/components/action-menu";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { DateField } from "@/components/date-field";
import { Icon, icons } from "@/components/icon";
import { MenuSelect } from "@/components/menu-select";
import { OptionSheet } from "@/components/option-sheet";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { locale, t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import { radius, sizes, space, usePalette } from "@/theme";

type Moves = {
	onRemove?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
};

function fieldGroupLabel(group: string) {
	return t(`collection.dynamic_group_${group}`);
}

/** Move up / move down / remove, from a native menu on the row. */
function rowActions(moves: Moves, removeLabel: string): MenuItem[][] {
	const order: MenuItem[] = [];
	if (moves.onMoveUp) {
		order.push({
			id: "up",
			label: t("collection.dynamic_move_up"),
			icon: icons.moveUp,
			onPress: moves.onMoveUp,
		});
	}
	if (moves.onMoveDown) {
		order.push({
			id: "down",
			label: t("collection.dynamic_move_down"),
			icon: icons.moveDown,
			onPress: moves.onMoveDown,
		});
	}
	const remove: MenuItem[] = moves.onRemove
		? [
				{
					id: "remove",
					label: removeLabel,
					icon: icons.trash,
					destructive: true,
					onPress: moves.onRemove,
				},
			]
		: [];
	return [order, remove].filter((section) => section.length > 0);
}

/** Picks a rule field from a searchable sheet, grouped as on the web. */
export function FieldSheet({
	selected,
	onSelect,
	onClose,
}: {
	selected?: CollectionRuleField;
	onSelect: (field: CollectionRuleField) => void;
	onClose: () => void;
}) {
	return (
		<OptionSheet
			title={t("collection.dynamic_add_filter")}
			searchPlaceholder={t("collection.dynamic_search_filters")}
			emptyLabel={t("collection.dynamic_no_options")}
			selected={selected}
			sections={COLLECTION_FIELD_GROUPS.map((group) => ({
				title: fieldGroupLabel(group.id),
				options: group.fields.map((field) => ({
					value: field,
					label: fieldLabel(field, locale),
				})),
			}))}
			onSelect={(field) => {
				onClose();
				onSelect(field as CollectionRuleField);
			}}
			onClose={onClose}
		/>
	);
}

export function GroupEditor({
	group,
	depth,
	canAddRule,
	onChange,
	...moves
}: {
	group: CollectionRuleGroup;
	depth: number;
	canAddRule: boolean;
	onChange: (group: CollectionRuleGroup) => void;
} & Moves) {
	const palette = usePalette();
	const [picking, setPicking] = useState(false);
	// Rows are keyed by position (the saved rules carry no ids), so a reorder
	// or removal remounts them: no input keeps its neighbour's text.
	const [order, setOrder] = useState(0);
	const reorder = (next: CollectionRuleGroup) => {
		setOrder((current) => current + 1);
		onChange(next);
	};
	const nested = depth > 1;
	const actions = rowActions(moves, t("collection.dynamic_remove_group"));

	return (
		<View
			style={[
				{ gap: space.md },
				nested && {
					padding: space.md,
					borderRadius: radius.field,
					borderCurve: "continuous",
					borderWidth: 1,
					borderColor: palette.separator,
					borderLeftWidth: 3,
					borderLeftColor: palette.accent,
				},
			]}
		>
			{nested ? (
				<View style={{ flexDirection: "row", alignItems: "center" }}>
					<View style={{ flex: 1, gap: 2 }}>
						<Text variant="label">{t("collection.dynamic_group_title")}</Text>
						<Text variant="caption" tone="secondary">
							{t("collection.dynamic_group_hint")}
						</Text>
					</View>
					{actions.length > 0 ? (
						<ActionMenuButton
							sections={actions}
							icon={icons.more}
							label={t("collection.dynamic_column_actions")}
							color={palette.textSecondary}
						/>
					) : null}
				</View>
			) : null}

			<View style={{ gap: space.sm }}>
				<Text variant="subhead" tone="secondary">
					{nested
						? t("collection.dynamic_group_match_label")
						: t("collection.dynamic_match_label")}
				</Text>
				<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
					<Chip
						label={t("collection.dynamic_match_all")}
						selected={group.match === "all"}
						onPress={() => onChange({ ...group, match: "all" })}
					/>
					<Chip
						label={t("collection.dynamic_match_any")}
						selected={group.match === "any"}
						onPress={() => onChange({ ...group, match: "any" })}
					/>
				</View>
			</View>

			{group.children.length === 0 ? (
				<View style={{ paddingVertical: space.lg, gap: space.xs }}>
					<Text variant="label" style={{ textAlign: "center" }}>
						{nested
							? t("collection.dynamic_empty_group_title")
							: t("collection.dynamic_no_filters_title")}
					</Text>
					<Text
						variant="subhead"
						tone="secondary"
						style={{ textAlign: "center" }}
					>
						{nested
							? t("collection.dynamic_empty_group_desc")
							: t("collection.dynamic_no_filters_desc")}
					</Text>
				</View>
			) : (
				<View>
					{group.children.map((child, index) => {
						const childMoves: Moves = {
							onRemove: () => reorder(removeChild(group, index)),
							onMoveUp:
								index > 0
									? () => reorder(moveChild(group, index, -1))
									: undefined,
							onMoveDown:
								index < group.children.length - 1
									? () => reorder(moveChild(group, index, 1))
									: undefined,
						};
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: The persisted AST has no UI-only identity.
							<Fragment key={`${order}-${child.kind}-${index}`}>
								{index > 0 ? <Connector match={group.match} /> : null}
								{child.kind === "group" ? (
									<GroupEditor
										group={child}
										depth={depth + 1}
										canAddRule={canAddRule}
										onChange={(next) =>
											onChange(replaceChild(group, index, next))
										}
										{...childMoves}
									/>
								) : (
									<RuleCard
										rule={child}
										onChange={(next) =>
											onChange(replaceChild(group, index, next))
										}
										{...childMoves}
									/>
								)}
							</Fragment>
						);
					})}
				</View>
			)}

			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
				<Button
					label={t("collection.dynamic_add_filter")}
					icon={<Icon name={icons.plus} size={16} color={palette.onPrimary} />}
					disabled={!canAddRule}
					onPress={() => setPicking(true)}
				/>
				{depth < COLLECTION_RULE_LIMITS.maxDepth ? (
					<Button
						variant="outline"
						label={t("collection.dynamic_add_group")}
						icon={<Icon name={icons.plus} size={16} color={palette.text} />}
						disabled={!canAddRule}
						onPress={() => onChange(appendChild(group, emptyGroup()))}
					/>
				) : null}
			</View>
			{picking ? (
				<FieldSheet
					onSelect={(field) => onChange(appendChild(group, defaultRule(field)))}
					onClose={() => setPicking(false)}
				/>
			) : null}
		</View>
	);
}

function Connector({ match }: { match: "all" | "any" }) {
	const palette = usePalette();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.sm,
				paddingVertical: space.sm,
			}}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<View
				style={{ flex: 1, height: 1, backgroundColor: palette.separator }}
			/>
			<Text
				variant="caption"
				tone="secondary"
				style={{
					fontWeight: "600",
					paddingHorizontal: space.sm,
					paddingVertical: 2,
					borderRadius: 999,
					overflow: "hidden",
					backgroundColor: palette.surface,
				}}
			>
				{match === "all"
					? t("collection.dynamic_connector_and")
					: t("collection.dynamic_connector_or")}
			</Text>
			<View
				style={{ flex: 1, height: 1, backgroundColor: palette.separator }}
			/>
		</View>
	);
}

function RuleCard({
	rule,
	onChange,
	...moves
}: {
	rule: CollectionFieldRule;
	onChange: (rule: CollectionFieldRule) => void;
} & Moves) {
	const palette = usePalette();
	const [picking, setPicking] = useState(false);
	const operators = COLLECTION_FIELD_OPERATORS[
		rule.field
	] as readonly CollectionRuleOperator[];
	const complete = isRuleComplete(rule);
	const actions = rowActions(moves, t("collection.dynamic_remove_rule"));

	return (
		<View
			style={{
				gap: space.sm,
				padding: space.md,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
				borderWidth: 1,
				borderColor: complete ? "transparent" : palette.danger,
			}}
		>
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
			>
				<Pressable
					onPress={() => setPicking(true)}
					accessibilityRole="button"
					accessibilityLabel={`${t("collection.dynamic_column_field")}: ${fieldLabel(rule.field, locale)}`}
					style={{
						flex: 1,
						minHeight: sizes.control,
						flexDirection: "row",
						alignItems: "center",
						gap: space.xs,
					}}
				>
					<Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
						{fieldLabel(rule.field, locale)}
					</Text>
					<Icon name={icons.collapse} size={14} color={palette.textSecondary} />
				</Pressable>
				{actions.length > 0 ? (
					<ActionMenuButton
						sections={actions}
						icon={icons.more}
						label={t("collection.dynamic_column_actions")}
						color={palette.textSecondary}
					/>
				) : null}
			</View>
			<MenuSelect
				value={rule.operator}
				options={operators.map((operator) => ({
					value: operator,
					label: operatorLabel(operator, locale),
				}))}
				onChange={(operator) => onChange(withOperator(rule, operator))}
			/>
			<RuleValue
				// A new field or operator starts the inputs over.
				key={`${rule.field}:${rule.operator}`}
				rule={rule}
				onChange={(value) => onChange({ ...rule, value })}
			/>
			{!complete ? (
				<Text variant="caption" tone="danger" accessibilityRole="alert">
					{t("collection.dynamic_preview_waiting")}
				</Text>
			) : null}
			{picking ? (
				<FieldSheet
					selected={rule.field}
					onSelect={(field) => onChange(defaultRule(field))}
					onClose={() => setPicking(false)}
				/>
			) : null}
		</View>
	);
}

function RuleValue({
	rule,
	onChange,
}: {
	rule: CollectionFieldRule;
	onChange: (value: CollectionRuleValue | undefined) => void;
}) {
	const input = ruleInputKind(rule, COLLECTION_ENUM_VALUES);
	const label = fieldLabel(rule.field, locale);

	switch (input.kind) {
		case "none":
			return (
				<Text variant="caption" tone="secondary">
					{t("collection.dynamic_no_value")}
				</Text>
			);
		case "range": {
			const range = (rule.value ?? {}) as Record<string, string | number>;
			if (input.date) {
				return (
					<View style={{ gap: space.sm }}>
						<LabeledField label={t("collection.dynamic_from")}>
							<DateField
								label={t("collection.dynamic_from")}
								value={String(range.from ?? "")}
								onChange={(from) =>
									onChange({ from, to: String(range.to ?? "") })
								}
							/>
						</LabeledField>
						<LabeledField label={t("collection.dynamic_to")}>
							<DateField
								label={t("collection.dynamic_to")}
								value={String(range.to ?? "")}
								onChange={(to) =>
									onChange({ from: String(range.from ?? ""), to })
								}
							/>
						</LabeledField>
					</View>
				);
			}
			return (
				<View style={{ flexDirection: "row", gap: space.sm }}>
					<NumberInput
						label={t("collection.dynamic_from")}
						value={Number(range.min ?? 0)}
						onChange={(min) => onChange({ min, max: Number(range.max ?? 0) })}
					/>
					<NumberInput
						label={t("collection.dynamic_to")}
						value={Number(range.max ?? 0)}
						onChange={(max) => onChange({ min: Number(range.min ?? 0), max })}
					/>
				</View>
			);
		}
		case "withinLast": {
			const value =
				rule.value && typeof rule.value === "object" && "amount" in rule.value
					? rule.value
					: { amount: 30, unit: "day" as const };
			return (
				<View style={{ flexDirection: "row", gap: space.sm }}>
					<NumberInput
						label={t("collection.dynamic_amount")}
						value={value.amount}
						onChange={(amount) => onChange({ ...value, amount })}
					/>
					<MenuSelect
						flex={1}
						value={value.unit}
						options={(["day", "week", "month"] as const).map((unit) => ({
							value: unit,
							label: valueLabel(unit, locale),
						}))}
						onChange={(unit) => onChange({ ...value, unit })}
					/>
				</View>
			);
		}
		case "entities":
			return (
				<EntityInput
					field={input.field}
					value={
						Array.isArray(rule.value)
							? rule.value.filter(
									(item): item is CollectionEntityRef =>
										typeof item === "object" && item !== null && "id" in item,
								)
							: []
					}
					onChange={onChange}
				/>
			);
		case "choices": {
			const values = Array.isArray(rule.value)
				? rule.value.filter((item): item is string => typeof item === "string")
				: [];
			return (
				<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
					{input.options.map((option) => {
						const on = values.includes(option);
						return (
							<Chip
								key={option}
								label={valueLabel(option, locale)}
								selected={on}
								onPress={() =>
									onChange(
										on
											? values.filter((value) => value !== option)
											: [...values, option].slice(
													0,
													COLLECTION_RULE_LIMITS.maxValues,
												),
									)
								}
							/>
						);
					})}
				</View>
			);
		}
		case "list": {
			const values = Array.isArray(rule.value)
				? rule.value.filter((item): item is string => typeof item === "string")
				: [];
			return (
				<TextField
					label={label}
					defaultValue={values.join(", ")}
					placeholder={t("collection.dynamic_value_placeholder")}
					autoCapitalize="none"
					onChangeText={(text) =>
						onChange(
							text
								.split(",")
								.map((value) => value.trim())
								.filter(Boolean),
						)
					}
				/>
			);
		}
		case "date":
			return (
				<DateField
					label={label}
					value={typeof rule.value === "string" ? rule.value : ""}
					onChange={onChange}
				/>
			);
		case "number":
			return (
				<NumberInput
					label={label}
					value={typeof rule.value === "number" ? rule.value : 0}
					onChange={onChange}
				/>
			);
		case "text":
			return (
				<TextField
					label={label}
					defaultValue={typeof rule.value === "string" ? rule.value : ""}
					placeholder={t("collection.dynamic_enter_value")}
					autoCapitalize="none"
					onChangeText={onChange}
				/>
			);
	}
}

function LabeledField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<View style={{ gap: space.xs }}>
			<Text variant="caption" tone="secondary">
				{label}
			</Text>
			{children}
		</View>
	);
}

function NumberInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<View style={{ flex: 1 }}>
			<TextField
				label={label}
				defaultValue={String(value)}
				keyboardType="decimal-pad"
				onChangeText={(text) => onChange(Number(text.replace(",", ".")))}
			/>
		</View>
	);
}

/** Authors, series, genres…: chosen from the server's own list, shown as
 * removable chips. */
function EntityInput({
	field,
	value,
	onChange,
}: {
	field: EntityField;
	value: CollectionEntityRef[];
	onChange: (value: CollectionRuleValue) => void;
}) {
	const { orpc } = useApi();
	const palette = usePalette();
	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState("");
	const options = useQuery({
		...orpc.collections.listRuleOptions.queryOptions({
			input: { field, query, limit: 30 },
		}),
		enabled: searching,
		staleTime: 30_000,
	});
	const name = fieldLabel(field, locale);
	const remaining =
		options.data?.filter(
			(option) => !value.some((selected) => selected.id === option.id),
		) ?? [];
	const full = value.length >= COLLECTION_RULE_LIMITS.maxValues;

	return (
		<View style={{ gap: space.sm }}>
			{value.length > 0 ? (
				<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
					{value.map((selected) => (
						<Pressable
							key={selected.id}
							onPress={() =>
								onChange(value.filter((item) => item.id !== selected.id))
							}
							accessibilityRole="button"
							accessibilityLabel={t("collection.dynamic_remove_named", {
								name: selected.label,
							})}
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: space.xs,
								minHeight: 36,
								paddingLeft: space.md,
								paddingRight: space.sm,
								borderRadius: radius.field,
								borderCurve: "continuous",
								backgroundColor: palette.surface,
							}}
						>
							<Text variant="subhead">{selected.label}</Text>
							<Icon
								name={icons.remove}
								size={16}
								color={palette.textSecondary}
							/>
						</Pressable>
					))}
				</View>
			) : null}
			<Button
				variant="outline"
				label={t("collection.dynamic_add_entity", { field: name })}
				icon={<Icon name={icons.plus} size={16} color={palette.text} />}
				disabled={full}
				onPress={() => setSearching(true)}
			/>
			{searching ? (
				<OptionSheet
					title={t("collection.dynamic_add_entity", { field: name })}
					searchPlaceholder={t("collection.dynamic_search_entity", {
						field: name.toLocaleLowerCase(locale),
					})}
					emptyLabel={t("collection.dynamic_no_options")}
					loading={options.isPending}
					sections={[
						{
							options: remaining.map((option) => ({
								value: option.id,
								label: option.label,
							})),
						},
					]}
					onQuery={setQuery}
					onSelect={(id) => {
						const picked = remaining.find((option) => option.id === id);
						if (picked) onChange([...value, picked]);
						setSearching(false);
						setQuery("");
					}}
					onClose={() => {
						setSearching(false);
						setQuery("");
					}}
				/>
			) : null}
		</View>
	);
}
