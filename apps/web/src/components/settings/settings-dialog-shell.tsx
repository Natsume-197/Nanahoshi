import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { Button } from "@/components/ui/button";
import { DialogLayerProvider } from "@/components/ui/modal";
import {
	useFloatingWindowDrag,
	useFloatingWindowResize,
} from "@/components/ui/use-floating-window-drag";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export function ThemeCustomizerShell({
	onClose,
	children,
}: {
	onClose: () => void;
	children: ReactNode;
}) {
	const desktop =
		typeof document !== "undefined" &&
		(document.documentElement.clientWidth || window.innerWidth) >= 768;
	const { surfaceRef, offsetRef, applyOffset, dragHandleProps } =
		useFloatingWindowDrag<HTMLDivElement>({ enabled: desktop });
	const { resizeHandleProps } = useFloatingWindowResize({
		surfaceRef,
		offsetRef,
		applyOffset,
		enabled: desktop,
	});

	useEffect(() => {
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	return createPortal(
		<div
			ref={surfaceRef}
			role="dialog"
			aria-labelledby="theme-customizer-title"
			className="theme-gradient-surface fixed inset-0 z-[60] flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none md:top-1/2 md:left-1/2 md:h-[min(42rem,calc(100dvh-2rem))] md:w-[min(32rem,calc(100vw-2rem))] md:rounded-2xl md:border md:border-border"
			style={{
				transform: desktop ? "translate3d(-50%, -50%, 0)" : undefined,
			}}
		>
			<header className="grid h-14 shrink-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 border-border border-b px-3">
				<span aria-hidden="true" />
				<button
					{...dragHandleProps}
					type="button"
					aria-label={m["reader_settings.move_window"]()}
					title={m["reader_settings.drag_to_move"]()}
					className="flex h-10 touch-none select-none items-center justify-center truncate rounded-lg font-semibold text-sm md:cursor-grab md:active:cursor-grabbing"
				>
					<span id="theme-customizer-title">
						{m["settings.appearance.custom_title"]()}
					</span>
				</button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 rounded-full"
					onClick={onClose}
					aria-label={m["common.close"]()}
				>
					<X aria-hidden="true" />
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
				{children}
			</div>
			<button
				{...resizeHandleProps}
				type="button"
				aria-label={m["reader_settings.resize_window"]()}
				title={m["reader_settings.drag_to_resize"]()}
				className="absolute right-0 bottom-0 z-10 hidden size-7 cursor-nwse-resize touch-none select-none items-center justify-center rounded-tl-md outline-none transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-[-3px] active:opacity-50 md:flex"
			>
				<svg
					aria-hidden="true"
					className="size-4 opacity-55"
					fill="none"
					focusable="false"
					viewBox="0 0 16 16"
				>
					<path
						d="M4 13.5 13.5 4"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.5"
					/>
					<path
						d="M9.5 13.5 13.5 9.5"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.5"
					/>
				</svg>
			</button>
		</div>,
		document.body,
	);
}

export function SettingsDialogShell({
	title,
	closeLabel,
	groups,
	activeKey,
	onNavigate,
	onClose,
	children,
	surfaceClassName = "theme-gradient-surface",
}: {
	title: string;
	closeLabel: string;
	groups: SettingsNavGroup[];
	activeKey: string;
	onNavigate: (key: string) => void;
	onClose: () => void;
	children: ReactNode;
	surfaceClassName?: string;
}) {
	return (
		<DialogPrimitive.Root
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-black/50 duration-150 data-closed:animate-out data-open:animate-in motion-reduce:animate-none" />
				<DialogPrimitive.Popup
					aria-modal="true"
					className={cn(
						"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed inset-0 z-50 grid h-dvh w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden overscroll-contain bg-background ps-[var(--safe-area-left)] pe-[var(--safe-area-right)] pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)] text-popover-foreground shadow-2xl outline-none duration-150 ease-out data-closed:animate-out data-open:animate-in motion-reduce:animate-none md:inset-1/2 md:h-[min(92dvh,920px)] md:max-w-6xl md:-translate-x-1/2 md:-translate-y-1/2 md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)] md:rounded-2xl md:ring-1 md:ring-border",
						surfaceClassName,
					)}
				>
					<header className="flex min-w-0 items-center justify-between gap-3 border-border border-b px-4 py-2.5 md:col-start-2 md:row-start-1 lg:px-8">
						<DialogPrimitive.Title className="min-w-0 text-balance font-semibold text-lg leading-tight">
							{title}
						</DialogPrimitive.Title>
						<DialogPrimitive.Close
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-lg"
									className="size-11 shrink-0 rounded-full md:size-9"
								>
									<X aria-hidden="true" />
									<span className="sr-only">{closeLabel}</span>
								</Button>
							}
						/>
					</header>

					<aside className="theme-gradient-surface min-w-0 overflow-hidden border-border border-b bg-sidebar px-3 py-3 text-sidebar-foreground md:col-start-1 md:row-span-2 md:row-start-1 md:overflow-y-auto md:border-e md:border-b-0 md:px-4 md:py-6">
						<SettingsSidebarNav
							groups={groups}
							activeKey={activeKey}
							onNavigate={onNavigate}
						/>
					</aside>

					<main
						className="min-h-0 min-w-0 overflow-y-auto overscroll-contain md:col-start-2 md:row-start-2"
						tabIndex={-1}
					>
						<div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-10 sm:px-6 lg:px-12 lg:pt-10 lg:pb-12">
							<DialogLayerProvider>{children}</DialogLayerProvider>
						</div>
					</main>
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
