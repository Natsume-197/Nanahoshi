import {
	Archive,
	Books,
	CheckCircle,
	CircleNotch,
	Prohibit,
	Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	ALL_BUCKETS,
	ALL_LIBRARIES,
	type EnrichmentBucket as Bucket,
	type BucketFilter,
	LIFECYCLE_BUCKET,
	type EnrichmentLifecycle as Lifecycle,
} from "./filters";
import { LIFECYCLE_LABELS, LifecycleDot } from "./lifecycle";
import { activeTrayTotal, lifecycleNavCount } from "./nav-counts";

export type ScopeSelection = { bucket: BucketFilter; lifecycle?: Lifecycle };

export const BUCKET_LABELS: Record<Bucket, () => string> = {
	in_progress: () => m["enrichment.bucket_in_progress"](),
	attention: () => m["enrichment.bucket_attention"](),
	stopped: () => m["enrichment.bucket_stopped"](),
	completed: () => m["enrichment.bucket_completed"](),
	history: () => m["enrichment.bucket_history"](),
};

const BUCKET_ICONS: Record<Bucket, ReactNode> = {
	in_progress: <CircleNotch />,
	attention: <Warning />,
	stopped: <Prohibit />,
	completed: <CheckCircle />,
	history: <Archive />,
};

// "In progress" the bucket (running + scheduled) and "in progress" the
// lifecycle are the same words, so the tree would show the same label twice at
// two depths. The child says what it actually is: those books are being
// enriched right now.
const NAV_LIFECYCLE_LABELS: Partial<Record<Lifecycle, () => string>> = {
	running: () => m["enrichment.nav_running"](),
};

// The nav is the bucket tree, not a list of section headings: each bucket is a
// row you can select, and the lifecycles it contains sit underneath it. Groups
// used to carry an uppercase caption, but it only ever restated the row below
// it — one node per concept reads faster and removes the duplicate labels.
const NAV_TREE: { bucket: Bucket; children: Lifecycle[] }[] = [
	{ bucket: "in_progress", children: ["running", "scheduled"] },
	{
		bucket: "attention",
		children: ["no_match", "review", "partial", "failed"],
	},
	{ bucket: "stopped", children: [] },
	{ bucket: "completed", children: [] },
	{ bucket: "history", children: [] },
];

function NavRow({
	active,
	label,
	count,
	icon,
	indented = false,
	onClick,
}: {
	active: boolean;
	label: string;
	count?: number;
	icon: ReactNode;
	indented?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={active ? "true" : undefined}
			className={cn(
				"flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-sm transition-colors duration-150",
				indented && "ps-6",
				active
					? "bg-primary/12 font-medium text-foreground"
					: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
				"[&>svg]:size-4 [&>svg]:shrink-0",
			)}
		>
			{icon}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count != null && (
				<span
					className={cn(
						"shrink-0 text-xs tabular-nums",
						count === 0 && "opacity-40",
					)}
				>
					{count}
				</span>
			)}
		</button>
	);
}

export function MatchSidebar({
	bucket,
	lifecycle,
	counts,
	lifecycleCounts,
	libraryUuid,
	libraries,
	onSelectScope,
	onSelectLibrary,
	className,
}: {
	bucket: BucketFilter;
	lifecycle: Lifecycle | undefined;
	counts: Partial<Record<Bucket, number>> | undefined;
	lifecycleCounts: Partial<Record<string, number>> | undefined;
	libraryUuid: string;
	libraries: { uuid: string; name: string | null }[];
	onSelectScope: (scope: ScopeSelection) => void;
	onSelectLibrary: (uuid: string) => void;
	className?: string;
}) {
	return (
		<nav
			aria-label={m["enrichment.nav_label"]()}
			className={cn("flex flex-col gap-0.5", className)}
		>
			<NavRow
				active={bucket === ALL_BUCKETS}
				label={m["enrichment.nav_all"]()}
				count={activeTrayTotal(counts)}
				icon={<Books weight="duotone" />}
				onClick={() => onSelectScope({ bucket: ALL_BUCKETS })}
			/>

			<div className="mt-2 flex flex-col gap-0.5">
				{NAV_TREE.map((node) => (
					<div key={node.bucket} className="flex flex-col gap-0.5">
						<NavRow
							active={bucket === node.bucket && lifecycle == null}
							label={BUCKET_LABELS[node.bucket]()}
							count={counts?.[node.bucket]}
							icon={BUCKET_ICONS[node.bucket]}
							onClick={() => onSelectScope({ bucket: node.bucket })}
						/>
						{node.children.map((child) => (
							<NavRow
								key={child}
								active={lifecycle === child}
								label={(
									NAV_LIFECYCLE_LABELS[child] ?? LIFECYCLE_LABELS[child]
								)()}
								count={lifecycleNavCount(child, counts, lifecycleCounts)}
								icon={<LifecycleDot lifecycle={child} />}
								indented
								onClick={() =>
									// The bucket must travel with the lifecycle, or
									// listInputFromSearch drops it as belonging elsewhere.
									onSelectScope({
										bucket: LIFECYCLE_BUCKET[child],
										lifecycle: child,
									})
								}
							/>
						))}
					</div>
				))}
			</div>

			{libraries.length > 1 && (
				<div className="mt-3 flex flex-col gap-0.5 border-border/60 border-t pt-3">
					<p className="px-2 pb-1 font-medium text-[0.6875rem] text-muted-foreground/70 uppercase tracking-wider">
						{m["enrichment.nav_group_libraries"]()}
					</p>
					<NavRow
						active={libraryUuid === ALL_LIBRARIES}
						label={m["enrichment.all_libraries"]()}
						icon={<span className="size-4" />}
						onClick={() => onSelectLibrary(ALL_LIBRARIES)}
					/>
					{libraries.map((library) => (
						<NavRow
							key={library.uuid}
							active={libraryUuid === library.uuid}
							label={library.name ?? library.uuid}
							icon={<span className="size-4" />}
							onClick={() => onSelectLibrary(library.uuid)}
						/>
					))}
				</div>
			)}
		</nav>
	);
}
