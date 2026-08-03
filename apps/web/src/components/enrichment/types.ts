import type { EnrichmentLifecycle as Lifecycle } from "./filters";
import type { EnrichmentStatus } from "./lifecycle";
import type { resolveRetryView } from "./retry-view";

/** One row of the match manager list, as the tray query returns it. */
export type MatchRow = {
	bookUuid: string;
	title: string | null;
	filename: string | null;
	cover: string | null;
	mediaType: "ebook" | "audiobook";
	libraryName: string | null;
	status: EnrichmentStatus;
	lifecycle: Lifecycle;
	matched: {
		provider: string;
		providerId?: string | null;
		title?: string;
		reasons?: string[];
	}[];
	failures: { provider: string; code: string }[];
	lastRunAt: string | null;
	retry: Parameters<typeof resolveRetryView>[0];
};

/** Every per-book action the row menu and the detail pane both offer. */
export type RowActions = {
	onRetry: () => void;
	onRefresh: () => void;
	onCancelRetry: () => void;
	onApprove: () => void;
	onStop: () => void;
	onArchive: () => void;
	onUnarchive: () => void;
	onFix: () => void;
};
