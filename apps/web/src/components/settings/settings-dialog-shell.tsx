import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { Button } from "@/components/ui/button";
import { DialogLayerProvider } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function SettingsDialogShell({
	title,
	closeLabel,
	groups,
	activeKey,
	onNavigate,
	onClose,
	children,
	surfaceClassName,
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

					<aside className="min-w-0 overflow-hidden border-border border-b bg-sidebar px-3 py-3 text-sidebar-foreground md:col-start-1 md:row-span-2 md:row-start-1 md:overflow-y-auto md:border-e md:border-b-0 md:px-4 md:py-6">
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
