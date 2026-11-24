import { cn } from "@nanahoshi/ui/lib/utils";
import {
	CaretLeft,
	CaretRight,
	CheckCircle,
	type Icon,
	Info,
	Warning,
	WarningOctagon,
	X,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { m } from "@/paraglide/messages";

export type AnnouncementSeverity = "info" | "success" | "warning" | "danger";

export const SEVERITY_ICON: Record<AnnouncementSeverity, Icon> = {
	info: Info,
	success: CheckCircle,
	warning: Warning,
	danger: WarningOctagon,
};

const TINT: Record<AnnouncementSeverity, string> = {
	info: "bg-info/10",
	success: "bg-success/10",
	warning: "bg-warning/10",
	danger: "bg-destructive/10",
};

const ICON_COLOR: Record<AnnouncementSeverity, string> = {
	info: "text-info",
	success: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
};

const ICON_BUTTON =
	"inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3";

/**
 * One announcement as a thin, softly tinted strip: icon + title · body,
 * centered. The side slots keep equal widths so the text stays centered
 * whether or not the pager and close button are there.
 */
export function AnnouncementStrip({
	severity,
	title,
	body,
	pager,
	onDismiss,
	className,
}: {
	severity: AnnouncementSeverity;
	title: string;
	body: string | null;
	pager?: {
		index: number;
		count: number;
		onPrev: () => void;
		onNext: () => void;
	};
	onDismiss?: () => void;
	className?: string;
}) {
	const Icon = SEVERITY_ICON[severity];
	const full = body ? `${title} · ${body}` : title;
	return (
		<div
			className={cn(
				"flex min-h-10 w-full items-center px-2 py-1 text-[13px] sm:px-3",
				TINT[severity],
				className,
			)}
		>
			<Side>
				{pager && pager.count > 1 && (
					<>
						<button
							type="button"
							className={ICON_BUTTON}
							aria-label={m["announcements.previous"]()}
							onClick={pager.onPrev}
						>
							<CaretLeft weight="bold" aria-hidden="true" />
						</button>
						<span className="hidden text-muted-foreground text-xs tabular-nums sm:inline">
							{pager.index + 1}/{pager.count}
						</span>
						<button
							type="button"
							className={ICON_BUTTON}
							aria-label={m["announcements.next"]()}
							onClick={pager.onNext}
						>
							<CaretRight weight="bold" aria-hidden="true" />
						</button>
					</>
				)}
			</Side>
			<div
				className="flex min-w-0 flex-1 items-center justify-center gap-2"
				title={full}
			>
				<Icon
					weight="fill"
					aria-hidden="true"
					className={cn("size-3.5 shrink-0", ICON_COLOR[severity])}
				/>
				<p className="line-clamp-2 min-w-0 text-balance text-center sm:line-clamp-1 sm:text-wrap">
					<span className="font-medium text-foreground">{title}</span>
					{body && <span className="text-muted-foreground"> · {body}</span>}
				</p>
			</div>
			<Side end>
				{onDismiss && (
					<button
						type="button"
						className={ICON_BUTTON}
						aria-label={m["announcements.dismiss"]()}
						onClick={onDismiss}
					>
						<X weight="bold" aria-hidden="true" />
					</button>
				)}
			</Side>
		</div>
	);
}

function Side({ children, end }: { children?: ReactNode; end?: boolean }) {
	return (
		<div
			className={cn(
				"flex w-14 shrink-0 items-center gap-0.5 sm:w-20",
				end && "justify-end",
			)}
		>
			{children}
		</div>
	);
}
