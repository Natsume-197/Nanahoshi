import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { MediaType, MetadataProviderId } from "./provider-priority-list";

// Fields the user can pin to specific providers, per media type. Mirrors the
// server manifest capabilities; a field absent here always follows the chain.
const ROUTABLE_FIELDS: Record<MediaType, string[]> = {
	ebook: [
		"description",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
		"tags",
		"publishedDate",
		"rating",
	],
	audiobook: [
		"description",
		"cover",
		"authors",
		"narrators",
		"publisher",
		"series",
		"genres",
		"tags",
		"publishedDate",
	],
};

const FIELD_LABELS: Record<string, () => string> = {
	description: () => m["library.provider_field_description"](),
	cover: () => m["library.provider_field_cover"](),
	authors: () => m["library.provider_field_authors"](),
	narrators: () => m["library.provider_field_narrators"](),
	publisher: () => m["library.provider_field_publisher"](),
	series: () => m["library.provider_field_series"](),
	genres: () => m["library.provider_field_genres"](),
	tags: () => m["library.provider_field_tags"](),
	publishedDate: () => m["library.provider_field_publishedDate"](),
	rating: () => m["library.provider_field_rating"](),
};

const PROVIDER_LABELS: Record<string, string> = {
	ranobedb: "RanobeDB",
	amazon: "Amazon",
	googlebooks: "Google Books",
	openlibrary: "Open Library",
	goodreads: "Goodreads",
	hardcover: "Hardcover",
	comicvine: "Comic Vine",
	audible: "Audible",
	itunes: "Apple iTunes",
};

export type FieldRules = Record<string, MetadataProviderId[]>;

// Rule editor for one field: providers from the enabled chain, each toggleable
// and reorderable. The stored rule is the ordered list of checked providers.
function FieldRuleRow({
	field,
	order,
	rule,
	onChange,
	disabled,
	expanded,
	onExpandedChange,
}: {
	field: string;
	order: MetadataProviderId[];
	rule: MetadataProviderId[] | undefined;
	onChange: (rule: MetadataProviderId[] | undefined) => void;
	disabled: boolean;
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
}) {
	const setExpanded = onExpandedChange;
	const hasRule = rule !== undefined;

	// Display order: rule order first, then remaining chain providers.
	const ordered = hasRule
		? [...rule, ...order.filter((id) => !rule.includes(id))]
		: order;
	const included = new Set(rule ?? []);

	const toggleProvider = (id: MetadataProviderId, checked: boolean) => {
		const base = rule ?? [];
		const next = checked ? [...base, id] : base.filter((p) => p !== id);
		onChange(next);
	};

	const moveProvider = (id: MetadataProviderId, delta: -1 | 1) => {
		if (!rule) return;
		const index = rule.indexOf(id);
		const target = index + delta;
		if (index === -1 || target < 0 || target >= rule.length) return;
		const next = [...rule];
		[next[index], next[target]] = [next[target], next[index]];
		onChange(next);
	};

	return (
		<li className="flex flex-col gap-2 py-3">
			<div className="flex items-center justify-between gap-2">
				<button
					type="button"
					className="flex items-center gap-2 text-left"
					onClick={() => setExpanded(!expanded)}
				>
					<span className="font-medium text-foreground text-sm">
						{FIELD_LABELS[field]?.() ?? field}
					</span>
					{hasRule ? (
						<span className="flex flex-wrap gap-1">
							{rule.length === 0 ? (
								<span className="text-amber-600 text-xs dark:text-amber-400">
									{m["library.field_rule_empty"]()}
								</span>
							) : (
								rule.map((id) => (
									<span
										key={id}
										className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground text-xs"
									>
										{PROVIDER_LABELS[id] ?? id}
									</span>
								))
							)}
						</span>
					) : (
						<span className="text-muted-foreground text-xs">
							{m["library.field_follows_order"]()}
						</span>
					)}
				</button>
				<div className="flex shrink-0 items-center gap-1">
					{hasRule && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={disabled}
							onClick={() => onChange(undefined)}
						>
							{m["library.field_reset_rule"]()}
						</Button>
					)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={disabled}
						onClick={() => {
							if (!hasRule) onChange([...order]);
							setExpanded(true);
						}}
					>
						{hasRule ? (
							<CaretUp data-icon="inline-start" />
						) : (
							m["library.field_set_rule"]()
						)}
					</Button>
				</div>
			</div>

			{expanded && hasRule && (
				<ul className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-2">
					{ordered.map((id) => {
						const isIncluded = included.has(id);
						const position = rule.indexOf(id);
						return (
							<li
								key={id}
								className={cn(
									"flex items-center gap-2 rounded px-2 py-1.5",
									!isIncluded && "opacity-50",
								)}
							>
								<Checkbox
									checked={isIncluded}
									onCheckedChange={(checked) =>
										toggleProvider(id, checked === true)
									}
									disabled={disabled}
									aria-label={PROVIDER_LABELS[id] ?? id}
								/>
								<span className="flex-1 text-sm">
									{PROVIDER_LABELS[id] ?? id}
								</span>
								{isIncluded && (
									<div className="flex items-center gap-0.5">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={disabled || position === 0}
											onClick={() => moveProvider(id, -1)}
											aria-label="up"
										>
											<CaretUp />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={disabled || position === rule.length - 1}
											onClick={() => moveProvider(id, 1)}
											aria-label="down"
										>
											<CaretDown />
										</Button>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</li>
	);
}

export function FieldRoutingEditor({
	mediaType,
	order,
	value,
	onChange,
	disabled = false,
}: {
	mediaType: MediaType;
	/** The enabled provider chain (priority order). */
	order: MetadataProviderId[];
	value: FieldRules;
	onChange: (value: FieldRules) => void;
	disabled?: boolean;
}) {
	const fields = ROUTABLE_FIELDS[mediaType];
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const setRule = (field: string, rule: MetadataProviderId[] | undefined) => {
		const next = { ...value };
		if (rule === undefined) delete next[field];
		else next[field] = rule;
		onChange(next);
	};

	const setExpandedField = (field: string, open: boolean) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (open) next.add(field);
			else next.delete(field);
			return next;
		});
	};

	return (
		<ul className="flex flex-col divide-y divide-border/60">
			{fields.map((field) => (
				<FieldRuleRow
					key={field}
					field={field}
					order={order}
					rule={value[field]}
					onChange={(rule) => setRule(field, rule)}
					disabled={disabled}
					expanded={expanded.has(field)}
					onExpandedChange={(open) => setExpandedField(field, open)}
				/>
			))}
		</ul>
	);
}
