import {
	ArrowClockwise,
	CheckCircle,
	CircleNotch,
	Prohibit,
	Question,
} from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	ALL_BUCKETS,
	type EnrichmentBucket as Bucket,
	type BucketFilter,
} from "./filters";
import { BUCKET_LABELS } from "./match-sidebar";

// What each bucket is, plus what the actions offered there actually do. Kept
// next to SelectionActions so the two stay in step: the same bucket→actions
// mapping decides which buttons render and which lines the help shows.
const BUCKET_HELP: Record<
	Bucket,
	{ summary: () => string; actions: (keyof typeof ACTION_HELP)[] }
> = {
	in_progress: {
		summary: () => m["enrichment.help_bucket_in_progress"](),
		actions: ["retry"],
	},
	attention: {
		summary: () => m["enrichment.help_bucket_attention"](),
		actions: ["retry", "approve"],
	},
	completed: {
		summary: () => m["enrichment.help_bucket_completed"](),
		actions: ["retry"],
	},
};

const ACTION_HELP = {
	retry: {
		label: () => m["enrichment.retry"](),
		body: () => m["enrichment.help_action_retry"](),
	},
	approve: {
		label: () => m["enrichment.approve"](),
		body: () => m["enrichment.help_action_approve"](),
	},
} as const;

export function BucketHelp({ bucket }: { bucket: Bucket }) {
	const help = BUCKET_HELP[bucket];
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={m["enrichment.help_open"]()}
						className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
					>
						{/* Not the Button component, so nothing normalises the glyph — a
						    bare Phosphor icon inherits 1em and would out-weigh the
						    text-sm heading beside it. */}
						<Question className="size-4" />
					</button>
				}
			/>
			<PopoverContent align="start" className="w-80 max-w-[calc(100vw-1rem)]">
				<p className="font-medium text-sm">{BUCKET_LABELS[bucket]()}</p>
				<p className="mt-1 text-muted-foreground text-sm">{help.summary()}</p>
				<dl className="mt-3 space-y-2 border-border/60 border-t pt-3">
					{help.actions.map((action) => (
						<div key={action}>
							<dt className="font-medium text-sm">
								{ACTION_HELP[action].label()}
							</dt>
							<dd className="text-muted-foreground text-sm">
								{ACTION_HELP[action].body()}
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Cross-fade between glyphs sharing one slot. No motion library here, so every
 * icon stays mounted, stacked in a single grid cell, and CSS animates
 * scale/opacity/blur — that way the outgoing icon gets an exit, not just a
 * disappearance. `data-icon` rides on the wrapper so the Button padding
 * selectors (`has-data-[icon=inline-start]`) still see it.
 */
export function IconSwap({
	active,
	icons,
	className,
	...rest
}: {
	active: string;
	icons: Record<string, ReactNode>;
	className?: string;
} & ComponentProps<"span">) {
	return (
		<span
			aria-hidden="true"
			className={cn("grid size-4 shrink-0 place-items-center", className)}
			{...rest}
		>
			{Object.entries(icons).map(([key, icon]) => (
				<span
					key={key}
					className={cn(
						"col-start-1 row-start-1 grid place-items-center transition-[opacity,scale,filter] duration-[var(--duration-quick)] ease-[cubic-bezier(0.2,0,0,1)]",
						key === active
							? "scale-100 opacity-100 blur-0"
							: "scale-25 opacity-0 blur-[4px]",
					)}
				>
					{icon}
				</span>
			))}
		</span>
	);
}

export function SelectionActions({
	bucket,
	busy,
	eligibility,
	onRetry,
	onApprove,
	onRestore,
}: {
	bucket: BucketFilter;
	busy: boolean;
	eligibility?: {
		retryable: number;
		approvable: number;
		refreshable: number;
	};
	onRetry: () => void;
	onApprove: () => void;
	onRestore: () => void;
}) {
	const hint = (count: number | undefined) =>
		count == null ? null : (
			<span className="text-muted-foreground text-xs tabular-nums">
				{count}
			</span>
		);

	const showApprove = bucket === "attention" || bucket === ALL_BUCKETS;
	return (
		<>
			<Button
				size="sm"
				variant="outline"
				onClick={onRetry}
				disabled={
					busy ||
					(bucket === "completed"
						? eligibility?.refreshable === 0
						: eligibility?.retryable === 0)
				}
			>
				<ArrowClockwise data-icon="inline-start" />
				{m["enrichment.retry"]()}
				{hint(
					bucket === "completed"
						? eligibility?.refreshable
						: eligibility?.retryable,
				)}
			</Button>
			{showApprove && (
				<Button
					size="sm"
					variant="outline"
					onClick={onApprove}
					disabled={busy || eligibility?.approvable === 0}
				>
					<CheckCircle data-icon="inline-start" />
					{m["enrichment.approve"]()}
					{hint(eligibility?.approvable)}
				</Button>
			)}
			{bucket === "completed" && (
				<Button size="sm" variant="outline" onClick={onRestore} disabled={busy}>
					{m["enrichment.restore_original"]()}
				</Button>
			)}
		</>
	);
}

export function ProviderFixDialog({
	open,
	onOpenChange,
	failures,
	providerLabels,
	reprocessCount,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	failures: [string, number][];
	providerLabels: Record<string, string>;
	reprocessCount: number;
	pending: boolean;
	onConfirm: (providers: string[]) => void;
}) {
	// Mounted fresh for each opening by useMatchActions.
	const [unchecked, setUnchecked] = useState<Set<string>>(new Set());

	const selected = failures
		.map(([provider]) => provider)
		.filter((provider) => !unchecked.has(provider));

	const toggle = (provider: string) =>
		setUnchecked((prev) => {
			const next = new Set(prev);
			if (next.has(provider)) next.delete(provider);
			else next.add(provider);
			return next;
		});

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["enrichment.fix_providers_title"]()}
			description={m["enrichment.fix_providers_body"]()}
			className="sm:max-w-lg"
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					{failures.map(([provider, count]) => {
						const label = providerLabels[provider] ?? provider;
						return (
							<button
								key={provider}
								type="button"
								onClick={() => toggle(provider)}
								aria-pressed={!unchecked.has(provider)}
								className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-start text-sm hover:bg-muted/50"
							>
								<Checkbox
									checked={!unchecked.has(provider)}
									aria-hidden
									tabIndex={-1}
									className="pointer-events-none"
								/>
								<span className="flex-1 font-medium">{label}</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									{m["enrichment.fix_providers_count"]({ count })}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-muted-foreground text-xs">
					{selected.length === 0
						? m["enrichment.fix_providers_none"]()
						: m["enrichment.fix_providers_reprocess"]({
								count: reprocessCount,
							})}
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button
						variant="destructive"
						onClick={() => onConfirm(selected)}
						disabled={pending || selected.length === 0}
					>
						{pending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<Prohibit data-icon="inline-start" />
						)}
						{m["enrichment.fix_providers_cta"]()}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
