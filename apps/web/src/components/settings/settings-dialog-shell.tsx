import { X } from "@phosphor-icons/react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
	useFloatingWindowDrag,
	useFloatingWindowResize,
} from "@/components/ui/use-floating-window-drag";
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
