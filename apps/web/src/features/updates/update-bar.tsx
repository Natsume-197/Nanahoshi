import { cn } from "@nanahoshi/ui/lib/utils";
import {
	ArrowCircleUp,
	ArrowClockwise,
	CircleNotch,
	type Icon,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
import { needsReload, updateNoticeQuery, useUpdateEvents } from "./use-updates";

const DISMISSED_KEY = "nanahoshi:update-bar-dismissed";

function readDismissed(): string | null {
	try {
		return typeof window === "undefined"
			? null
			: window.localStorage.getItem(DISMISSED_KEY);
	} catch {
		return null;
	}
}

function storeDismissed(version: string) {
	try {
		window.localStorage.setItem(DISMISSED_KEY, version);
	} catch {}
}

/**
 * The update strip at the top of the window, one message at a time, most
 * urgent first:
 *
 * 1. This page is older than the server (it was just updated): reload.
 * 2. A restart is planned or under way: everyone sees it, an admin can cancel.
 * 3. For admins, a newer release is out, until they close it for that version.
 */
export function UpdateBar() {
	useUpdateEvents();
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const { data: notice } = useQuery(updateNoticeQuery());
	const { openSettings } = useSettingsModal();
	const [dismissed, setDismissed] = useState(readDismissed);
	const cancel = useMutation({
		...orpc.updates.cancel.mutationOptions(),
		onSuccess: () => {
			toast.success(m["updates.toast_cancelled"]());
			void queryClient.invalidateQueries({ queryKey: orpc.updates.key() });
		},
		onError: (error) => toast.error(error.message),
	});

	if (!notice) return null;

	if (needsReload(notice.release)) {
		return (
			<Strip icon={ArrowClockwise}>
				<span>{m["updates.bar.reload"]({ version: notice.release })}</span>
				<StripAction onClick={() => window.location.reload()}>
					{m["updates.bar.reload_action"]()}
				</StripAction>
			</Strip>
		);
	}

	const schedule = notice.schedule;
	if (schedule) {
		const text = schedule.installing
			? m["updates.bar.installing"]()
			: schedule.mode === "now"
				? m["updates.bar.scheduled_now"]()
				: schedule.requestedByName
					? m["updates.bar.scheduled_by"]({ name: schedule.requestedByName })
					: m["updates.bar.scheduled_auto"]();
		return (
			<Strip
				icon={schedule.installing ? CircleNotch : ArrowCircleUp}
				spin={schedule.installing}
				tone="warning"
			>
				<span role="status">{text}</span>
				{isAdmin && !schedule.installing && (
					<StripAction
						disabled={cancel.isPending}
						onClick={() => cancel.mutate({})}
					>
						{m["updates.bar.cancel"]()}
					</StripAction>
				)}
			</Strip>
		);
	}

	if (isAdmin && notice.available && dismissed !== notice.available) {
		const version = notice.available;
		return (
			<Strip
				icon={ArrowCircleUp}
				onDismiss={() => {
					storeDismissed(version);
					setDismissed(version);
				}}
			>
				<span>{m["updates.bar.available"]({ version })}</span>
				<StripAction onClick={() => openSettings("updates")}>
					{m["updates.bar.view"]()}
				</StripAction>
			</Strip>
		);
	}

	return null;
}

function Strip({
	icon: IconComponent,
	spin,
	tone = "info",
	onDismiss,
	children,
}: {
	icon: Icon;
	spin?: boolean;
	tone?: "info" | "warning";
	onDismiss?: () => void;
	children: ReactNode;
}) {
	return (
		<section
			aria-label={m["updates.nav"]()}
			className={cn(
				"flex min-h-10 w-full shrink-0 items-center gap-2 px-3 py-1 text-[13px]",
				tone === "warning" ? "bg-warning/10" : "bg-info/10",
			)}
		>
			<div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
				<IconComponent
					aria-hidden="true"
					className={cn(
						"size-4 shrink-0",
						tone === "warning" ? "text-warning" : "text-info",
						spin && "animate-spin",
					)}
				/>
				{children}
			</div>
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label={m["updates.bar.dismiss"]()}
					className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<X aria-hidden="true" className="size-3" />
				</button>
			)}
		</section>
	);
}

function StripAction({
	onClick,
	disabled,
	children,
}: {
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="cursor-pointer rounded font-medium text-foreground underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60"
		>
			{children}
		</button>
	);
}
