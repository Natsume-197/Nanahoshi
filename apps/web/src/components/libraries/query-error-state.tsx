import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function QueryErrorState({
	onRetry,
	compact = false,
}: {
	onRetry: () => void;
	compact?: boolean;
}) {
	return (
		<div
			className={
				compact
					? "flex flex-col items-center gap-3 px-4 py-8 text-center"
					: "flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border/60 px-6 text-center"
			}
			role="alert"
		>
			<WarningCircle
				className="size-8 text-muted-foreground"
				weight="duotone"
			/>
			<div className="flex max-w-sm flex-col gap-1">
				<p className="font-medium text-foreground">
					{m["library.load_error_title"]()}
				</p>
				<p className="text-muted-foreground text-sm">
					{m["library.load_error_desc"]()}
				</p>
			</div>
			<Button type="button" variant="outline" size="sm" onClick={onRetry}>
				{m["common.retry"]()}
			</Button>
		</div>
	);
}
