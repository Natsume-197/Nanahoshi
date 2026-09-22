import { m } from "@/paraglide/messages";
import { MatchReasonChip } from "./lifecycle";

export function ApprovalReasonBreakdown({
	byReason,
}: {
	byReason: Record<string, number>;
}) {
	return (
		<section className="space-y-2">
			<h3 className="font-medium text-sm">
				{m["enrichment.approval_preview_reasons"]()}
			</h3>
			{Object.entries(byReason).map(([reason, count]) => (
				<div key={reason} className="flex items-center justify-between gap-3">
					<MatchReasonChip reasons={[reason]} />
					<span className="text-muted-foreground text-sm tabular-nums">
						{count}
					</span>
				</div>
			))}
		</section>
	);
}
