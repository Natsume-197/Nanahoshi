import {
	COLLECTION_ENUM_VALUES,
	COLLECTION_FIELD_OPERATORS,
	COLLECTION_RULE_LIMITS,
	COLLECTION_SORT_FIELDS,
	type CollectionFieldRule,
	type CollectionRuleField,
	type CollectionRuleGroup,
	type CollectionRuleOperator,
	type CollectionRuleValue,
	type CollectionSortRule,
	DynamicCollectionDefinitionSchema,
	type DynamicCollectionDefinitionV1,
	isPersonalizedCollectionDefinition,
} from "@nanahoshi-v2/api/routers/collections/collection-rules";
import {
	Books,
	CaretDown,
	CaretUp,
	CheckCircle,
	CircleNotch,
	Eye,
	FunnelSimple,
	Lightning,
	MagnifyingGlass,
	Plus,
	SortAscending,
	Trash,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Fragment, useState } from "react";
import { CollectionArtwork } from "@/components/shared/collection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";
import {
	COLLECTION_FIELD_GROUPS,
	fieldLabel,
	operatorLabel,
	templateLabel,
	valueLabel,
} from "./dynamic-collection-labels";
import {
	DYNAMIC_COLLECTION_TEMPLATES,
	emptyDynamicCollectionDefinition,
} from "./dynamic-collection-templates";

const PRESENCE_OPERATORS = new Set([
	"isMissing",
	"isPresent",
	"isTrue",
	"isFalse",
	"isUnknown",
]);
const ENTITY_FIELDS = new Set([
	"author",
	"narrator",
	"publisher",
	"series",
	"genre",
	"tag",
	"library",
	"manualCollection",
]);
const DATE_FIELDS = new Set([
	"addedAt",
	"lastModifiedAt",
	"publishedDate",
	"startedAt",
	"completedAt",
	"lastActivityAt",
]);
const NUMBER_FIELDS = new Set([
	"seriesPosition",
	"fileSizeMb",
	"publishedYear",
	"pageCount",
	"durationMinutes",
	"communityRating",
	"communityRatingCount",
	"progressPercent",
]);
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const countRules = (group: CollectionRuleGroup): number =>
	group.children.reduce(
		(total, child) => total + (child.kind === "group" ? countRules(child) : 1),
		0,
	);

const defaultRule = (
	field: CollectionRuleField = "title",
): CollectionFieldRule => {
	const operator = COLLECTION_FIELD_OPERATORS[
		field
	][0] as CollectionRuleOperator;
	return {
		kind: "rule",
		field,
		operator,
		value: defaultValue(field, operator),
	};
};

type EditorProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	initial?: DynamicCollectionDefinitionV1;
	initialName?: string;
	initialDescription?: string | null;
	initialPublic?: boolean;
	submitLabel: string;
	isSubmitting: boolean;
	onSubmit: (value: {
		name: string;
		description?: string;
		isPublic: boolean;
		definition: DynamicCollectionDefinitionV1;
	}) => unknown | Promise<unknown>;
};

export function DynamicCollectionEditor({
	open,
	onOpenChange,
	title,
	description: modalDescription,
	initial,
	initialName = "",
	initialDescription,
	initialPublic = false,
	submitLabel,
	isSubmitting,
	onSubmit,
}: EditorProps) {
	const [baseline] = useState(
		() => initial ?? emptyDynamicCollectionDefinition(),
	);
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription ?? "");
	const [isPublic, setIsPublic] = useState(initialPublic);
	const [definition, setDefinition] = useState(baseline);
	const [submittingNavigation, setSubmittingNavigation] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const locale = getLocale();
	const isDirty =
		name !== initialName ||
		description !== (initialDescription ?? "") ||
		isPublic !== initialPublic ||
		JSON.stringify(definition) !== JSON.stringify(baseline);
	useBlocker({
		disabled: !isDirty || submittingNavigation,
		enableBeforeUnload: isDirty && !submittingNavigation,
		shouldBlockFn: () =>
			!window.confirm(m["collection.dynamic_leave_confirm"]()),
	});
	const parsed = DynamicCollectionDefinitionSchema.safeParse(definition);
	const canAddRule =
		countRules(definition.root) < COLLECTION_RULE_LIMITS.maxRules;
	const previewDefinition = useDebounce(
		parsed.success ? parsed.data : null,
		450,
	);
	const preview = useQuery({
		...orpc.collections.previewDefinition.queryOptions({
			input: {
				definition: previewDefinition ?? emptyDynamicCollectionDefinition(),
				limit: 6,
				timeZone: LOCAL_TIME_ZONE,
			},
		}),
		enabled: previewDefinition !== null,
		staleTime: 10_000,
		gcTime: 0,
	});

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!parsed.success || !name.trim()) {
			setShowErrors(true);
			return;
		}
		setSubmittingNavigation(true);
		try {
			await onSubmit({
				name: name.trim(),
				description: description.trim() || undefined,
				isPublic,
				definition: parsed.data,
			});
		} catch {
			setSubmittingNavigation(false);
		}
	};
	const requestOpenChange = (nextOpen: boolean) => {
		if (
			!nextOpen &&
			isDirty &&
			!submittingNavigation &&
			!window.confirm(m["collection.dynamic_leave_confirm"]())
		) {
			return;
		}
		if (!nextOpen) setSubmittingNavigation(true);
		onOpenChange(nextOpen);
	};
	const ruleCount = countRules(definition.root);
	const sortSummary = definition.sort
		.map(
			(sort) =>
				`${fieldLabel(sort.field, locale)} · ${valueLabel(sort.direction, locale)}`,
		)
		.join(", ");
	const previewCovers = Array.from(
		new Set(
			preview.data?.sample
				.map((book) => book.cover)
				.filter((cover): cover is string => typeof cover === "string") ?? [],
		),
	);

	return (
		<Modal
			open={open}
			onOpenChange={requestOpenChange}
			title={title}
			description={modalDescription}
			bare
			showCloseButton={false}
			className="top-0 left-0 flex h-[100dvh] max-h-[100dvh] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(900px,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(1180px,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[min(var(--radius-4xl),24px)]"
		>
			<form
				onSubmit={(event) => void submit(event)}
				className="flex size-full min-h-0 flex-col"
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="absolute end-3 top-3 z-10 min-h-11 min-w-11 bg-secondary sm:end-4 sm:top-4"
					onClick={() => requestOpenChange(false)}
				>
					<X aria-hidden="true" />
					<span className="sr-only">{m["common.close"]()}</span>
				</Button>
				<div className="shrink-0 px-5 py-4 pe-16 sm:px-7 sm:py-5 sm:pe-16">
					<div className="flex items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<FunnelSimple aria-hidden="true" />
						</div>
						<div className="min-w-0">
							<p className="font-heading font-semibold text-xl">{title}</p>
							<p className="text-muted-foreground text-sm">
								{modalDescription}
							</p>
						</div>
					</div>
				</div>

				<div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain border-border/60 border-t lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
					<div className="order-2 flex min-w-0 flex-col gap-8 p-5 sm:p-7 lg:order-1 lg:overflow-y-auto lg:p-8">
						<section className="shrink-0">
							<div className="flex items-start gap-3">
								<div className="flex min-w-0 flex-col gap-1.5">
									<h2 className="font-semibold text-lg">
										{m["collection.dynamic_details_title"]()}
									</h2>
									<p className="text-muted-foreground text-sm">
										{m["collection.dynamic_details_desc"]()}
									</p>
								</div>
							</div>
							<div className="mt-5">
								<FieldGroup className="gap-4">
									<Field data-invalid={showErrors && !name.trim()}>
										<FieldLabel htmlFor="dynamic-collection-name">
											{m["collection.name_label"]()}
										</FieldLabel>
										<Input
											id="dynamic-collection-name"
											value={name}
											onChange={(event) => setName(event.target.value)}
											placeholder={m["collection.dynamic_name_help"]()}
											maxLength={80}
											autoFocus
											aria-invalid={showErrors && !name.trim()}
										/>
										{showErrors && !name.trim() && (
											<FieldError>
												{m["collection.dynamic_name_required"]()}
											</FieldError>
										)}
									</Field>
									<Field>
										<FieldLabel htmlFor="dynamic-collection-description">
											{m["collection.dynamic_description_label"]()}
										</FieldLabel>
										<Textarea
											id="dynamic-collection-description"
											value={description}
											onChange={(event) => setDescription(event.target.value)}
											maxLength={280}
											rows={2}
										/>
									</Field>
									<Field orientation="horizontal" className="py-2">
										<Checkbox
											id="dynamic-collection-public"
											checked={isPublic}
											onCheckedChange={(checked) =>
												setIsPublic(checked === true)
											}
										/>
										<FieldContent>
											<FieldLabel htmlFor="dynamic-collection-public">
												{m["collection.public_title"]()}
											</FieldLabel>
											<FieldDescription>
												{m["collection.dynamic_public_help"]()}
											</FieldDescription>
										</FieldContent>
									</Field>
								</FieldGroup>
								{isPublic &&
									parsed.success &&
									isPersonalizedCollectionDefinition(parsed.data) && (
										<div className="mt-4 flex gap-2 text-muted-foreground text-sm">
											<WarningCircle
												className="mt-0.5 shrink-0"
												aria-hidden="true"
											/>
											<p>{m["collection.public_personal_desc"]()}</p>
										</div>
									)}
							</div>
						</section>

						<section className="shrink-0 border-border/60 border-t pt-8">
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<FunnelSimple aria-hidden="true" />
												<h2 className="font-semibold text-lg">
													{m["collection.dynamic_rules_title"]()}
												</h2>
												<Badge variant="secondary">{ruleCount}</Badge>
											</div>
											<p className="mt-1.5 text-muted-foreground text-sm">
												{m["collection.dynamic_rules_desc"]()}
											</p>
										</div>
										<QuickFiltersPicker
											locale={locale}
											definition={definition}
											onApply={setDefinition}
										/>
									</div>
								</div>
							</div>
							<div className="mt-5">
								<GroupEditor
									group={definition.root}
									depth={1}
									canAddRule={canAddRule}
									locale={locale}
									onChange={(root) => setDefinition({ ...definition, root })}
								/>
							</div>
						</section>

						<details className="group/order shrink-0 border-border/60 border-t pt-8">
							<summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
								<div className="flex min-w-0 items-start gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<SortAscending aria-hidden="true" />
											<h2 className="font-semibold text-lg">
												{m["collection.dynamic_order_title"]()}
											</h2>
										</div>
										<p className="mt-1 truncate text-muted-foreground text-sm">
											{sortSummary}
										</p>
									</div>
								</div>
								<span className="flex shrink-0 items-center gap-1.5 font-medium text-sm">
									{m["collection.dynamic_change_order"]()}
									<CaretDown
										className="transition-transform duration-150 group-open/order:rotate-180"
										aria-hidden="true"
									/>
								</span>
							</summary>
							<div className="mt-5">
								<p className="mb-4 text-muted-foreground text-sm">
									{m["collection.dynamic_order_desc"]()}
								</p>
								<SortEditor
									value={definition.sort}
									locale={locale}
									onChange={(sort) => setDefinition({ ...definition, sort })}
								/>
							</div>
						</details>
					</div>

					<aside className="order-1 min-w-0 bg-muted/35 p-4 sm:p-6 lg:order-2 lg:overflow-y-auto lg:border-border/60 lg:border-s">
						<div className="flex flex-col gap-4 lg:sticky lg:top-0">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2 font-medium">
									<Eye aria-hidden="true" />
									<h3>{m["collection.dynamic_preview_title"]()}</h3>
								</div>
								{parsed.success && !preview.isFetching && !preview.isError && (
									<Badge variant="success">
										<CheckCircle data-icon="inline-start" aria-hidden="true" />
										{m["collection.dynamic"]()}
									</Badge>
								)}
							</div>
							<div role="status" aria-live="polite" className="min-h-24">
								{!parsed.success ? (
									<div className="flex items-center gap-3 py-2 text-muted-foreground text-sm">
										<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
											<FunnelSimple
												className="size-8 opacity-40"
												aria-hidden="true"
											/>
										</div>
										<p>{m["collection.dynamic_preview_waiting"]()}</p>
									</div>
								) : preview.isFetching ? (
									<div className="flex items-center gap-3 py-2">
										<Skeleton className="size-12 shrink-0 rounded-lg" />
										<div className="flex flex-1 flex-col gap-2">
											<Skeleton className="h-7 w-24" />
											<p className="text-muted-foreground text-sm">
												{m["collection.dynamic_preview_updating"]()}
											</p>
										</div>
									</div>
								) : preview.isError ? (
									<div className="flex items-center gap-3 py-2 text-destructive text-sm">
										<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
											<WarningCircle className="size-8" aria-hidden="true" />
										</div>
										<p>{m["collection.dynamic_preview_error"]()}</p>
									</div>
								) : (preview.data?.count ?? 0) === 0 ? (
									<div className="flex items-center gap-3 py-2">
										<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
											<Books className="size-8 opacity-60" aria-hidden="true" />
										</div>
										<div>
											<p className="font-medium">
												{m["collection.dynamic_preview_empty"]()}
											</p>
											<p className="mt-1 text-muted-foreground text-sm">
												{m["collection.dynamic_preview_empty_desc"]()}
											</p>
										</div>
									</div>
								) : (
									<div className="flex min-w-0 flex-col gap-4 py-2">
										<div>
											<p className="font-heading font-semibold text-2xl tabular-nums">
												{m["collection.dynamic_preview_count"]({
													count: preview.data?.count ?? 0,
												})}
											</p>
											<p className="mt-1 text-muted-foreground text-xs">
												{m["collection.dynamic_preview_sample"]()}
											</p>
										</div>
										{previewCovers.length > 0 && (
											<div className="flex gap-2" aria-hidden="true">
												{previewCovers.slice(0, 3).map((cover) => (
													<div
														key={cover}
														className="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-black/10 dark:ring-white/10"
													>
														<CollectionArtwork covers={[cover]} />
													</div>
												))}
											</div>
										)}
										<div className="min-w-0">
											<ul className="flex flex-col gap-1.5 text-sm">
												{preview.data?.sample.slice(0, 3).map((book) => (
													<li key={book.uuid} className="truncate">
														{book.title ?? book.filename}
													</li>
												))}
											</ul>
										</div>
									</div>
								)}
							</div>
						</div>
					</aside>
				</div>

				<div className="shrink-0 border-border/60 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
						{showErrors && (!parsed.success || !name.trim()) && (
							<p className="text-destructive text-sm sm:me-auto" role="alert">
								{m["collection.dynamic_form_error"]()}
							</p>
						)}
						<div className="flex flex-col-reverse gap-2 sm:flex-row">
							<Button
								type="button"
								variant="outline"
								onClick={() => requestOpenChange(false)}
							>
								{m["common.cancel"]()}
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting && (
									<CircleNotch
										className="animate-spin"
										data-icon="inline-start"
									/>
								)}
								{submitLabel}
							</Button>
						</div>
					</div>
				</div>
			</form>
		</Modal>
	);
}

function QuickFiltersPicker({
	locale,
	definition,
	onApply,
}: {
	locale: string;
	definition: DynamicCollectionDefinitionV1;
	onApply: (definition: DynamicCollectionDefinitionV1) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const normalizedSearch = search.trim().toLocaleLowerCase(locale);
	const templates = DYNAMIC_COLLECTION_TEMPLATES.filter((template) =>
		templateLabel(template.id, locale)
			.toLocaleLowerCase(locale)
			.includes(normalizedSearch),
	);
	const existingRuleCount =
		definition.root.children.length === 0 ? 0 : countRules(definition.root);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 w-full sm:w-auto"
				>
					<Lightning data-icon="inline-start" aria-hidden="true" />
					{m["collection.dynamic_quick_filters"]()}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(360px,calc(100vw-2rem))] gap-2 p-2"
			>
				<div className="relative">
					<MagnifyingGlass
						className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						autoFocus
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={m["collection.dynamic_search_quick_filters"]()}
						aria-label={m["collection.dynamic_search_quick_filters"]()}
						className="h-10 ps-9"
					/>
				</div>
				<p className="px-2 pt-1 text-muted-foreground text-xs">
					{m["collection.dynamic_quick_filters_desc"]()}
				</p>
				<div className="max-h-72 overflow-y-auto overscroll-contain">
					{templates.length === 0 ? (
						<p className="px-3 py-6 text-center text-muted-foreground text-sm">
							{m["collection.dynamic_no_options"]()}
						</p>
					) : (
						<div className="flex flex-col gap-1">
							{templates.map((template) => {
								const templateRuleCount = countRules(template.definition.root);
								const disabled =
									existingRuleCount + templateRuleCount >
									COLLECTION_RULE_LIMITS.maxRules;
								return (
									<Button
										key={template.id}
										type="button"
										variant="ghost"
										className="h-auto min-h-10 justify-between gap-3 whitespace-normal px-3 py-2 text-start"
										disabled={disabled}
										onClick={() => {
											if (definition.root.children.length === 0) {
												onApply(template.definition);
											} else {
												const additions = template.definition.root.children;
												const child =
													additions.length === 1
														? additions[0]
														: {
																kind: "group" as const,
																match: "all" as const,
																children: additions,
															};
												onApply({
													...definition,
													root: {
														...definition.root,
														children: [...definition.root.children, child],
													},
												});
											}
											setOpen(false);
										}}
									>
										<span>{templateLabel(template.id, locale)}</span>
										{template.definition.root.children.some(
											(child) => child.kind === "group",
										) && (
											<Badge variant="secondary" className="shrink-0">
												{m["collection.dynamic_uses_groups"]()}
											</Badge>
										)}
									</Button>
								);
							})}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function FilterPicker({
	locale,
	disabled,
	onSelect,
}: {
	locale: string;
	disabled: boolean;
	onSelect: (field: CollectionRuleField) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const normalizedSearch = search.trim().toLocaleLowerCase(locale);
	const groups = COLLECTION_FIELD_GROUPS.map((group) => ({
		...group,
		fields: group.fields.filter((field) =>
			fieldLabel(field, locale)
				.toLocaleLowerCase(locale)
				.includes(normalizedSearch),
		),
	})).filter((group) => group.fields.length > 0);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					size="sm"
					className="min-h-10"
					disabled={disabled}
				>
					<Plus data-icon="inline-start" aria-hidden="true" />
					{m["collection.dynamic_add_filter"]()}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[min(380px,calc(100vw-2rem))] gap-2 p-2"
			>
				<div className="relative">
					<MagnifyingGlass
						className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						autoFocus
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={m["collection.dynamic_search_filters"]()}
						aria-label={m["collection.dynamic_search_filters"]()}
						className="h-10 ps-9"
					/>
				</div>
				<div className="max-h-80 overflow-y-auto overscroll-contain">
					{groups.length === 0 ? (
						<p className="px-3 py-6 text-center text-muted-foreground text-sm">
							{m["collection.dynamic_no_options"]()}
						</p>
					) : (
						<div className="flex flex-col gap-3 py-1">
							{groups.map((group) => (
								<div key={group.id}>
									<p className="px-3 py-1 font-medium text-muted-foreground text-xs">
										{fieldGroupLabel(group.id)}
									</p>
									<div className="flex flex-col gap-0.5">
										{group.fields.map((field) => (
											<Button
												key={field}
												type="button"
												variant="ghost"
												className="min-h-10 justify-start px-3"
												onClick={() => {
													onSelect(field);
													setOpen(false);
												}}
											>
												{fieldLabel(field, locale)}
											</Button>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function GroupEditor({
	group,
	depth,
	canAddRule,
	locale,
	onChange,
	onRemove,
	onMoveUp,
	onMoveDown,
}: {
	group: CollectionRuleGroup;
	depth: number;
	canAddRule: boolean;
	locale: string;
	onChange: (group: CollectionRuleGroup) => void;
	onRemove?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
}) {
	const setChild = (
		index: number,
		child: CollectionRuleGroup | CollectionFieldRule,
	) =>
		onChange({
			...group,
			children: group.children.map((current, childIndex) =>
				childIndex === index ? child : current,
			),
		});
	const removeChild = (index: number) =>
		onChange({
			...group,
			children: group.children.filter((_, childIndex) => childIndex !== index),
		});
	const moveChild = (index: number, direction: -1 | 1) => {
		const target = index + direction;
		if (target < 0 || target >= group.children.length) return;
		const children = [...group.children];
		[children[index], children[target]] = [
			children[target] as (typeof children)[number],
			children[index] as (typeof children)[number],
		];
		onChange({ ...group, children });
	};
	return (
		<fieldset
			className={cn(
				"flex min-w-0 flex-col gap-3",
				depth > 1 &&
					"relative border-primary/40 border-s-2 py-2 ps-5 before:absolute before:-start-px before:top-0 before:h-px before:w-4 before:bg-primary/40 after:absolute after:-start-px after:bottom-0 after:h-px after:w-4 after:bg-primary/40",
			)}
		>
			<legend className="sr-only">
				{depth > 1
					? m["collection.dynamic_group_title"]()
					: m["collection.dynamic_rules_title"]()}
			</legend>
			{depth > 1 && (
				<div className="flex items-baseline gap-2">
					<span className="font-semibold text-sm">
						{m["collection.dynamic_group_title"]()}
					</span>
					<span className="text-muted-foreground text-xs">
						{m["collection.dynamic_group_hint"]()}
					</span>
				</div>
			)}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<p className="font-medium text-sm">
						{depth > 1
							? m["collection.dynamic_group_match_label"]()
							: m["collection.dynamic_match_label"]()}
					</p>
					<ToggleGroup
						value={[group.match]}
						onValueChange={(values) => {
							const match = values[0] as "all" | "any" | undefined;
							if (match) onChange({ ...group, match });
						}}
						variant="segmented"
						spacing={0}
						aria-label={
							depth > 1
								? m["collection.dynamic_group_match_label"]()
								: m["collection.dynamic_match_label"]()
						}
						className="w-full sm:w-fit"
					>
						<ToggleGroupItem
							value="all"
							className="min-h-10 flex-1 px-3 sm:flex-none"
						>
							<span className="sm:hidden">{valueLabel("all", locale)}</span>
							<span className="hidden sm:inline">
								{m["collection.dynamic_match_all"]()}
							</span>
						</ToggleGroupItem>
						<ToggleGroupItem
							value="any"
							className="min-h-10 flex-1 px-3 sm:flex-none"
						>
							<span className="sm:hidden">{valueLabel("any", locale)}</span>
							<span className="hidden sm:inline">
								{m["collection.dynamic_match_any"]()}
							</span>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
				{onRemove && (
					<div className="flex items-center self-end text-muted-foreground">
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							className="min-h-11 min-w-11"
							aria-label={m["collection.dynamic_move_up"]()}
							disabled={!onMoveUp}
							onClick={onMoveUp}
						>
							<CaretUp />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							className="min-h-11 min-w-11"
							aria-label={m["collection.dynamic_move_down"]()}
							disabled={!onMoveDown}
							onClick={onMoveDown}
						>
							<CaretDown />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							className="min-h-11 min-w-11"
							aria-label={m["collection.dynamic_remove_group"]()}
							onClick={onRemove}
						>
							<Trash />
						</Button>
					</div>
				)}
			</div>
			{group.children.some((child) => child.kind === "rule") && (
				<div className="hidden grid-cols-[minmax(150px,1fr)_minmax(145px,0.9fr)_minmax(180px,1.25fr)_auto] gap-2 border-border/50 border-b pb-2 font-medium text-muted-foreground text-xs md:grid">
					<span>{m["collection.dynamic_column_field"]()}</span>
					<span>{m["collection.dynamic_column_condition"]()}</span>
					<span>{m["collection.dynamic_column_value"]()}</span>
					<span className="sr-only">
						{m["collection.dynamic_column_actions"]()}
					</span>
				</div>
			)}
			<div className="flex flex-col">
				{group.children.length === 0 && (
					<div className="px-4 py-6 text-center">
						<p className="font-medium">
							{depth > 1
								? m["collection.dynamic_empty_group_title"]()
								: m["collection.dynamic_no_filters_title"]()}
						</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{depth > 1
								? m["collection.dynamic_empty_group_desc"]()
								: m["collection.dynamic_no_filters_desc"]()}
						</p>
					</div>
				)}
				{group.children.map((child, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: The persisted AST intentionally has no UI-only identity.
					<Fragment key={`${child.kind}-${index}`}>
						{index > 0 && <RuleConnector match={group.match} />}
						{child.kind === "group" ? (
							<GroupEditor
								group={child}
								depth={depth + 1}
								canAddRule={canAddRule}
								locale={locale}
								onChange={(next) => setChild(index, next)}
								onRemove={() => removeChild(index)}
								onMoveUp={index > 0 ? () => moveChild(index, -1) : undefined}
								onMoveDown={
									index < group.children.length - 1
										? () => moveChild(index, 1)
										: undefined
								}
							/>
						) : (
							<RuleEditor
								rule={child}
								locale={locale}
								onChange={(next) => setChild(index, next)}
								onRemove={() => removeChild(index)}
								onMoveUp={index > 0 ? () => moveChild(index, -1) : undefined}
								onMoveDown={
									index < group.children.length - 1
										? () => moveChild(index, 1)
										: undefined
								}
							/>
						)}
					</Fragment>
				))}
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2 border-border/50 border-t pt-4">
				<FilterPicker
					locale={locale}
					disabled={!canAddRule}
					onSelect={(field) =>
						onChange({
							...group,
							children: [...group.children, defaultRule(field)],
						})
					}
				/>
				{depth < COLLECTION_RULE_LIMITS.maxDepth && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="min-h-10"
						disabled={!canAddRule}
						onClick={() =>
							onChange({
								...group,
								children: [
									...group.children,
									{ kind: "group", match: "all", children: [] },
								],
							})
						}
					>
						<Plus data-icon="inline-start" />
						{m["collection.dynamic_add_group"]()}
					</Button>
				)}
			</div>
		</fieldset>
	);
}

function RuleConnector({ match }: { match: "all" | "any" }) {
	return (
		<div className="flex items-center gap-2 py-2" aria-hidden="true">
			<span className="h-px flex-1 bg-border/70" />
			<span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground text-xs">
				{match === "all"
					? m["collection.dynamic_connector_and"]()
					: m["collection.dynamic_connector_or"]()}
			</span>
			<span className="h-px flex-1 bg-border/70" />
		</div>
	);
}

function RuleEditor({
	rule,
	locale,
	onChange,
	onRemove,
	onMoveUp,
	onMoveDown,
}: {
	rule: CollectionFieldRule;
	locale: string;
	onChange: (rule: CollectionFieldRule) => void;
	onRemove: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
}) {
	const operators = COLLECTION_FIELD_OPERATORS[
		rule.field
	] as readonly CollectionRuleOperator[];
	const complete = isRuleComplete(rule);
	return (
		<div className="group/rule py-3" data-invalid={!complete || undefined}>
			<div className="grid min-w-0 gap-2 md:grid-cols-[minmax(150px,1fr)_minmax(145px,0.9fr)_minmax(180px,1.25fr)_auto] md:items-start">
				<FieldSelect
					value={rule.field}
					locale={locale}
					onChange={(fieldValue) => {
						const field = fieldValue as CollectionRuleField;
						const operator = COLLECTION_FIELD_OPERATORS[
							field
						][0] as CollectionRuleOperator;
						onChange({
							kind: "rule",
							field,
							operator,
							value: defaultValue(field, operator),
						});
					}}
				/>
				<SmallSelect
					value={rule.operator}
					options={operators}
					labelForOption={(option) =>
						operatorLabel(option as CollectionRuleOperator, locale)
					}
					onChange={(operatorValue) => {
						const operator = operatorValue as CollectionRuleOperator;
						onChange({
							...rule,
							operator,
							value: defaultValue(rule.field, operator),
						});
					}}
				/>
				<RuleValueInput
					rule={rule}
					locale={locale}
					onChange={(value) => onChange({ ...rule, value })}
				/>
				<div className="flex items-center justify-end transition-opacity duration-150 md:justify-start [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/rule:opacity-100 [@media(hover:hover)]:group-hover/rule:opacity-100">
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						className="min-h-11 min-w-11"
						aria-label={m["collection.dynamic_move_up"]()}
						disabled={!onMoveUp}
						onClick={onMoveUp}
					>
						<CaretUp />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						className="min-h-11 min-w-11"
						aria-label={m["collection.dynamic_move_down"]()}
						disabled={!onMoveDown}
						onClick={onMoveDown}
					>
						<CaretDown />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						className="min-h-11 min-w-11"
						aria-label={m["collection.dynamic_remove_rule"]()}
						onClick={onRemove}
					>
						<Trash />
					</Button>
				</div>
			</div>
			{!complete && (
				<p className="mt-2 text-destructive text-xs" role="alert">
					{m["collection.dynamic_preview_waiting"]()}
				</p>
			)}
		</div>
	);
}

function RuleValueInput({
	rule,
	locale,
	onChange,
}: {
	rule: CollectionFieldRule;
	locale: string;
	onChange: (value: CollectionRuleValue | undefined) => void;
}) {
	if (PRESENCE_OPERATORS.has(rule.operator))
		return (
			<span className="self-center text-muted-foreground text-xs">
				{m["collection.dynamic_no_value"]()}
			</span>
		);
	if (rule.operator === "between") {
		const date = DATE_FIELDS.has(rule.field);
		const range = (rule.value ?? {}) as Record<string, string | number>;
		return (
			<div className="grid grid-cols-2 gap-2">
				<Input
					aria-label={m["collection.dynamic_from"]()}
					type={date ? "date" : "number"}
					value={String(range[date ? "from" : "min"] ?? "")}
					onChange={(event) =>
						onChange(
							date
								? { from: event.target.value, to: String(range.to ?? "") }
								: {
										min: Number(event.target.value),
										max: Number(range.max ?? 0),
									},
						)
					}
				/>
				<Input
					aria-label={m["collection.dynamic_to"]()}
					type={date ? "date" : "number"}
					value={String(range[date ? "to" : "max"] ?? "")}
					onChange={(event) =>
						onChange(
							date
								? { from: String(range.from ?? ""), to: event.target.value }
								: {
										min: Number(range.min ?? 0),
										max: Number(event.target.value),
									},
						)
					}
				/>
			</div>
		);
	}
	if (rule.operator === "withinLast") {
		const value =
			typeof rule.value === "object" && rule.value && "amount" in rule.value
				? rule.value
				: { amount: 1, unit: "day" as const };
		return (
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<Input
					aria-label={m["collection.dynamic_amount"]()}
					type="number"
					min={1}
					max={365}
					value={value.amount}
					onChange={(event) =>
						onChange({ ...value, amount: Number(event.target.value) })
					}
				/>
				<SmallSelect
					value={value.unit}
					options={["day", "week", "month"]}
					labelForOption={(option) => valueLabel(option, locale)}
					onChange={(unit) =>
						onChange({ ...value, unit: unit as "day" | "week" | "month" })
					}
				/>
			</div>
		);
	}
	if (ENTITY_FIELDS.has(rule.field)) {
		return (
			<EntityRuleInput
				field={rule.field as EntityField}
				locale={locale}
				value={
					Array.isArray(rule.value)
						? rule.value.filter(
								(item): item is { id: string; label: string } =>
									typeof item === "object" &&
									item !== null &&
									"id" in item &&
									"label" in item,
							)
						: []
				}
				onChange={onChange}
			/>
		);
	}
	if (["includesAny", "includesAll", "excludesAll"].includes(rule.operator)) {
		const values = Array.isArray(rule.value)
			? rule.value.filter((item): item is string => typeof item === "string")
			: [];
		const knownValues = COLLECTION_ENUM_VALUES[
			rule.field as keyof typeof COLLECTION_ENUM_VALUES
		] as readonly string[] | undefined;
		if (knownValues) {
			return (
				<ToggleGroup
					multiple
					value={values}
					onValueChange={(next) =>
						onChange(next.slice(0, COLLECTION_RULE_LIMITS.maxValues))
					}
					variant="outline"
					className="flex w-full flex-wrap justify-start"
					aria-label={fieldLabel(rule.field, locale)}
				>
					{knownValues.map((option) => (
						<ToggleGroupItem key={option} value={option} className="min-h-10">
							{valueLabel(option, locale)}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			);
		}
		return (
			<Input
				value={values.join(", ")}
				onChange={(event) =>
					onChange(
						event.target.value
							.split(",")
							.map((value) => value.trim())
							.filter(Boolean),
					)
				}
				placeholder={m["collection.dynamic_value_placeholder"]()}
				aria-label={fieldLabel(rule.field, locale)}
			/>
		);
	}
	return (
		<Input
			type={
				DATE_FIELDS.has(rule.field)
					? "date"
					: NUMBER_FIELDS.has(rule.field)
						? "number"
						: "text"
			}
			value={
				typeof rule.value === "string" || typeof rule.value === "number"
					? rule.value
					: ""
			}
			placeholder={
				DATE_FIELDS.has(rule.field)
					? undefined
					: m["collection.dynamic_enter_value"]()
			}
			onChange={(event) =>
				onChange(
					NUMBER_FIELDS.has(rule.field)
						? Number(event.target.value)
						: event.target.value,
				)
			}
			aria-label={fieldLabel(rule.field, locale)}
		/>
	);
}

type EntityField =
	| "author"
	| "narrator"
	| "publisher"
	| "series"
	| "genre"
	| "tag"
	| "library"
	| "manualCollection";

function EntityRuleInput({
	field,
	value,
	locale,
	onChange,
}: {
	field: EntityField;
	value: Array<{ id: string; label: string }>;
	locale: string;
	onChange: (value: CollectionRuleValue) => void;
}) {
	const [search, setSearch] = useState("");
	const [optionsOpen, setOptionsOpen] = useState(false);
	const query = useDebounce(search.trim(), 250);
	const options = useQuery({
		...orpc.collections.listRuleOptions.queryOptions({
			input: { field, query, limit: 30 },
		}),
		enabled: optionsOpen || query.length > 0,
		staleTime: 30_000,
	});
	const remaining =
		options.data?.filter(
			(option) => !value.some((selected) => selected.id === option.id),
		) ?? [];
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto]">
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={m["collection.dynamic_search_entity"]({
						field: fieldLabel(field, locale).toLocaleLowerCase(locale),
					})}
					aria-label={m["collection.dynamic_search_entity"]({
						field: fieldLabel(field, locale),
					})}
				/>
				<Select
					value={null as string | null}
					onOpenChange={setOptionsOpen}
					onValueChange={(id) => {
						const selected = remaining.find((option) => option.id === id);
						if (selected) onChange([...value, selected]);
					}}
				>
					<SelectTrigger
						className="h-10 w-full sm:w-auto"
						aria-label={m["collection.dynamic_add_entity"]({
							field: fieldLabel(field, locale),
						})}
					>
						<SelectValue>
							{options.isFetching
								? m["collection.loading"]()
								: m["collection.dynamic_add_entity"]({
										field: fieldLabel(field, locale),
									})}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{remaining.length === 0 ? (
								<p className="px-3 py-2 text-muted-foreground text-sm">
									{m["collection.dynamic_no_options"]()}
								</p>
							) : (
								remaining.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))
							)}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((selected) => (
						<Badge key={selected.id} variant="secondary" className="gap-1 pe-1">
							{selected.label}
							<button
								type="button"
								className="flex size-7 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
								aria-label={m["collection.dynamic_remove_named"]({
									name: selected.label,
								})}
								onClick={() =>
									onChange(value.filter((item) => item.id !== selected.id))
								}
							>
								<X aria-hidden="true" />
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}

function SortEditor({
	value,
	locale,
	onChange,
}: {
	value: CollectionSortRule[];
	locale: string;
	onChange: (value: CollectionSortRule[]) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			{value.map((sort, index) => (
				<div
					key={sort.field}
					className={cn(
						"grid gap-2 py-3 first:pt-0 sm:grid-cols-[1fr_1fr_auto]",
						index < value.length - 1 && "border-border/50 border-b",
					)}
				>
					<SmallSelect
						value={sort.field}
						options={COLLECTION_SORT_FIELDS.filter(
							(field) =>
								field === sort.field ||
								!value.some((item) => item.field === field),
						)}
						labelForOption={(option) =>
							fieldLabel(option as CollectionSortRule["field"], locale)
						}
						onChange={(field) =>
							onChange(
								value.map((item, itemIndex) =>
									itemIndex === index
										? { ...item, field: field as CollectionSortRule["field"] }
										: item,
								),
							)
						}
					/>
					<SmallSelect
						value={sort.direction}
						options={["asc", "desc"]}
						labelForOption={(option) => valueLabel(option, locale)}
						onChange={(direction) =>
							onChange(
								value.map((item, itemIndex) =>
									itemIndex === index
										? { ...item, direction: direction as "asc" | "desc" }
										: item,
								),
							)
						}
					/>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						className="min-h-11 min-w-11 justify-self-end sm:justify-self-auto"
						aria-label={m["collection.dynamic_remove_sort"]()}
						onClick={() =>
							onChange(value.filter((_, itemIndex) => itemIndex !== index))
						}
					>
						<Trash />
					</Button>
				</div>
			))}
			{value.length < 3 && (
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="mt-2"
					onClick={() => {
						const field = COLLECTION_SORT_FIELDS.find(
							(candidate) => !value.some((item) => item.field === candidate),
						);
						if (field) onChange([...value, { field, direction: "asc" }]);
					}}
				>
					<Plus data-icon="inline-start" />
					{m["collection.dynamic_add_sort"]()}
				</Button>
			)}
		</div>
	);
}

function SmallSelect({
	value,
	options,
	labelForOption = (option) => option,
	onChange,
}: {
	value: string;
	options: readonly string[];
	labelForOption?: (option: string) => string;
	onChange: (value: string) => void;
}) {
	return (
		<Select value={value} onValueChange={(next) => next && onChange(next)}>
			<SelectTrigger className="w-full min-w-0">
				<SelectValue>{labelForOption(value)}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{labelForOption(option)}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

function FieldSelect({
	value,
	locale,
	onChange,
}: {
	value: CollectionRuleField;
	locale: string;
	onChange: (value: string) => void;
}) {
	return (
		<Select value={value} onValueChange={(next) => next && onChange(next)}>
			<SelectTrigger className="h-10 w-full min-w-0">
				<SelectValue>{fieldLabel(value, locale)}</SelectValue>
			</SelectTrigger>
			<SelectContent position="popper" className="max-h-96">
				{COLLECTION_FIELD_GROUPS.map((group) => (
					<SelectGroup key={group.id}>
						<SelectLabel>{fieldGroupLabel(group.id)}</SelectLabel>
						{group.fields.map((field) => (
							<SelectItem key={field} value={field}>
								{fieldLabel(field, locale)}
							</SelectItem>
						))}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	);
}

function fieldGroupLabel(group: string) {
	switch (group) {
		case "identity":
			return m["collection.dynamic_group_identity"]();
		case "people":
			return m["collection.dynamic_group_people"]();
		case "catalog":
			return m["collection.dynamic_group_catalog"]();
		case "file":
			return m["collection.dynamic_group_file"]();
		case "library":
			return m["collection.dynamic_group_library"]();
		default:
			return m["collection.dynamic_group_personal"]();
	}
}

function isRuleComplete(rule: CollectionFieldRule) {
	if (PRESENCE_OPERATORS.has(rule.operator)) return true;
	if (rule.operator === "between") {
		if (
			!rule.value ||
			typeof rule.value !== "object" ||
			Array.isArray(rule.value)
		)
			return false;
		if (DATE_FIELDS.has(rule.field)) {
			return (
				"from" in rule.value &&
				"to" in rule.value &&
				Boolean(rule.value.from) &&
				Boolean(rule.value.to)
			);
		}
		return (
			"min" in rule.value &&
			"max" in rule.value &&
			Number.isFinite(rule.value.min) &&
			Number.isFinite(rule.value.max)
		);
	}
	if (rule.operator === "withinLast") {
		return Boolean(
			rule.value &&
				typeof rule.value === "object" &&
				!Array.isArray(rule.value) &&
				"amount" in rule.value &&
				rule.value.amount > 0,
		);
	}
	if (Array.isArray(rule.value)) return rule.value.length > 0;
	if (typeof rule.value === "string") return rule.value.trim().length > 0;
	return typeof rule.value === "number" && Number.isFinite(rule.value);
}

function defaultValue(
	field: CollectionRuleField,
	operator: CollectionRuleOperator,
): CollectionRuleValue | undefined {
	if (PRESENCE_OPERATORS.has(operator)) return undefined;
	if (operator === "between")
		return DATE_FIELDS.has(field) ? { from: "", to: "" } : { min: 0, max: 0 };
	if (operator === "withinLast") return { amount: 30, unit: "day" };
	if (ENTITY_FIELDS.has(field)) return [];
	if (["includesAny", "includesAll", "excludesAll"].includes(operator))
		return [];
	if (NUMBER_FIELDS.has(field)) return 0;
	return "";
}
