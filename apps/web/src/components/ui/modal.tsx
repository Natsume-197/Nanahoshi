import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "@phosphor-icons/react";
import {
	type CSSProperties,
	createContext,
	type FormEvent,
	type ReactNode,
	useContext,
	useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { usePrefersBottomSheet } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const OVERLAY_CLASS =
	"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/25 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-none";

// Tall bodies scroll inside the popup instead of running off the viewport;
// callers that want a different cap just pass their own max-h/overflow.
const CONTENT_CLASS =
	"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto overscroll-contain rounded-[min(var(--radius-4xl),24px)] bg-popover p-6 text-popover-foreground text-sm shadow-xl outline-none ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-md dark:ring-foreground/10";

// Phones get the same edge-to-edge sheet as the player's panels: flush with the
// bottom edge, only the top corners rounded, sized to its content up to just
// under the status bar.
const SHEET_CLASS =
	"rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 bg-background text-foreground [--drawer-bleed-background:var(--background)] [--drawer-content-max-height:calc(100dvh-var(--safe-area-top)-1rem)] [--drawer-inset:0px]";

// The body scrolls under a pinned close button; Base UI only lets a downward
// swipe dismiss once this is scrolled to the top.
const SHEET_BODY_CLASS =
	"grid min-h-0 content-start gap-6 overflow-y-auto overscroll-contain px-[max(1.25rem,var(--safe-area-left))] pt-2 pr-[max(1.25rem,var(--safe-area-right))] pb-[max(1.25rem,var(--safe-area-bottom))] text-sm";

const TITLE_CLASS = "font-heading font-medium text-base leading-none";
const DESCRIPTION_CLASS =
	"text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground";

const DialogLayerContext = createContext(false);

const RESTORED_FOCUS_ATTRIBUTE = "data-modal-restored-focus";

function suppressRestoredFocusIndicator(element: HTMLElement) {
	element.setAttribute(RESTORED_FOCUS_ATTRIBUTE, "");
	element.addEventListener(
		"blur",
		() => element.removeAttribute(RESTORED_FOCUS_ATTRIBUTE),
		{ once: true },
	);
}

export type ModalPresentation = "dialog" | "sheet";

/**
 * Where a modal should appear. Phones get a bottom sheet (swipe down to dismiss,
 * thumb-reachable actions) — what native apps use for this kind of task. `bare`
 * modals own their whole layout (lightboxes, full-screen editors), so they keep
 * the dialog unless they ask for the sheet explicitly.
 */
export function resolveModalPresentation({
	prefersSheet,
	bare = false,
	mobilePresentation,
}: {
	prefersSheet: boolean;
	bare?: boolean;
	mobilePresentation?: ModalPresentation;
}): ModalPresentation {
	const wanted = mobilePresentation ?? (bare ? "dialog" : "sheet");
	return prefersSheet && wanted === "sheet" ? "sheet" : "dialog";
}

function ModalTitle({
	sheet,
	className,
	children,
}: {
	sheet: boolean;
	className: string;
	children: ReactNode;
}) {
	return sheet ? (
		<DrawerPrimitive.Title className={className}>
			{children}
		</DrawerPrimitive.Title>
	) : (
		<DialogPrimitive.Title className={className}>
			{children}
		</DialogPrimitive.Title>
	);
}

function ModalDescription({
	sheet,
	className,
	children,
}: {
	sheet: boolean;
	className: string;
	children: ReactNode;
}) {
	return sheet ? (
		<DrawerPrimitive.Description className={className}>
			{children}
		</DrawerPrimitive.Description>
	) : (
		<DialogPrimitive.Description className={className}>
			{children}
		</DialogPrimitive.Description>
	);
}

function ModalCloseButton({
	sheet,
	className,
}: {
	sheet: boolean;
	className: string;
}) {
	const button = (
		<Button variant="ghost" className={className} size="icon-sm">
			<X />
			<span className="sr-only">{m["common.close"]()}</span>
		</Button>
	);
	return sheet ? (
		<DrawerPrimitive.Close render={button} />
	) : (
		<DialogPrimitive.Close render={button} />
	);
}

export function DialogLayerProvider({ children }: { children: ReactNode }) {
	return (
		<DialogLayerContext.Provider value>{children}</DialogLayerContext.Provider>
	);
}

interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	/** Body content (fields, text, etc.). */
	children?: ReactNode;
	/** Action buttons rendered in the footer. Omit for a bodyless message modal. */
	footer?: ReactNode;
	/**
	 * When provided, the header, body and footer are wrapped in a `<form>` so
	 * footer buttons can use `type="submit"`.
	 */
	onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
	className?: string;
	layerClassName?: string;
	style?: CSSProperties;
	/** Show the built-in close (X) button. Defaults to true. */
	showCloseButton?: boolean;
	/**
	 * Chrome-less mode: renders only `children` (no visible header/footer),
	 * keeping an sr-only title/description for accessibility. Use for modals with
	 * a fully custom layout such as an image lightbox or a file browser.
	 * Bare modals present as a centered dialog unless `mobilePresentation` is
	 * `"sheet"`.
	 */
	bare?: boolean;
	/**
	 * How the modal presents on phones: `"sheet"` (a bottom sheet with
	 * swipe-to-dismiss) or `"dialog"` (centered). Defaults to `"sheet"`, or to
	 * `"dialog"` for `bare` modals.
	 */
	mobilePresentation?: ModalPresentation;
}

/**
 * Generic modal built on dialog primitives: standard header
 * (title + optional description), body and footer. Pass `onSubmit` to turn it
 * into a form modal, or `bare` for a fully custom layout. Also used for
 * destructive confirmations (footer with cancel + destructive action).
 */
export function Modal({
	open,
	onOpenChange,
	onOpenChangeComplete,
	title,
	description,
	children,
	footer,
	onSubmit,
	className,
	layerClassName,
	style,
	showCloseButton = true,
	bare,
	mobilePresentation,
}: ModalProps) {
	const nested = useContext(DialogLayerContext);
	const prefersSheet = usePrefersBottomSheet();
	const previouslyOpenRef = useRef(false);
	const presentationRef = useRef<ModalPresentation>("dialog");
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const closedWithEscapeRef = useRef(false);

	// These controlled dialogs are commonly opened without a Dialog.Trigger.
	// Capture the focused opener before Base UI moves focus into the popup so it
	// can still be restored when the modal is conditionally mounted.
	if (open && !previouslyOpenRef.current && typeof document !== "undefined") {
		const activeElement = document.activeElement;
		returnFocusRef.current =
			activeElement instanceof HTMLElement && activeElement !== document.body
				? activeElement
				: null;
		closedWithEscapeRef.current = false;
	}
	// Decided once per opening: rotating a phone mid-form must not swap the
	// sheet for a dialog, which would remount the body and drop what was typed.
	if (open && !previouslyOpenRef.current) {
		presentationRef.current = resolveModalPresentation({
			prefersSheet,
			bare,
			mobilePresentation,
		});
	}
	previouslyOpenRef.current = open;
	const sheet = presentationRef.current === "sheet";

	const content = bare ? (
		<>
			<ModalTitle sheet={sheet} className="sr-only">
				{title}
			</ModalTitle>
			{description && (
				<ModalDescription sheet={sheet} className="sr-only">
					{description}
				</ModalDescription>
			)}
			{children}
		</>
	) : (
		(() => {
			const body = (
				<>
					<div
						className={cn(
							"flex flex-col gap-1.5",
							// Keep the title clear of the pinned close button.
							sheet && showCloseButton && "pe-12",
						)}
					>
						<ModalTitle sheet={sheet} className={TITLE_CLASS}>
							{title}
						</ModalTitle>
						{description && (
							<ModalDescription sheet={sheet} className={DESCRIPTION_CLASS}>
								{description}
							</ModalDescription>
						)}
					</div>
					{children}
					{footer && (
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							{footer}
						</div>
					)}
				</>
			);
			return onSubmit ? (
				<form className="grid gap-6" onSubmit={onSubmit}>
					{body}
				</form>
			) : (
				body
			);
		})()
	);
	const exitingContentRef = useRef(content);
	if (open) exitingContentRef.current = content;

	const handleOpenChange = (
		nextOpen: boolean,
		eventDetails: { reason: string },
	) => {
		closedWithEscapeRef.current =
			!nextOpen && eventDetails.reason === "escape-key";
		onOpenChange(nextOpen);
	};
	const finalFocus = () => {
		const returnFocus = returnFocusRef.current;
		const canRestoreFocus = returnFocus?.isConnected === true;
		if (closedWithEscapeRef.current && canRestoreFocus) {
			suppressRestoredFocusIndicator(returnFocus);
		}
		return canRestoreFocus ? returnFocus : true;
	};

	if (sheet) {
		return (
			<Drawer
				open={open}
				onOpenChange={handleOpenChange}
				onOpenChangeComplete={onOpenChangeComplete}
				modal={nested ? "trap-focus" : true}
				showSwipeHandle
				keyboardAware
				overlayClassName={cn(
					"supports-backdrop-filter:backdrop-blur-none",
					layerClassName,
				)}
				viewportClassName={layerClassName}
			>
				<DrawerContent
					data-slot="modal-sheet"
					finalFocus={finalFocus}
					className={SHEET_CLASS}
					style={style}
				>
					{/* Caller classes land on the body, which holds the same
					    header / children / footer the dialog popup does, so width
					    caps and child selectors written for the dialog still apply. */}
					<div className={cn(SHEET_BODY_CLASS, className)}>
						<DialogLayerProvider>
							{open ? content : exitingContentRef.current}
						</DialogLayerProvider>
					</div>
					{showCloseButton && (
						<ModalCloseButton
							sheet
							className="absolute end-3 top-3 bg-secondary"
						/>
					)}
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<DialogPrimitive.Root
			open={open}
			onOpenChange={handleOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			modal={nested ? "trap-focus" : true}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop
					forceRender
					data-slot="modal-backdrop"
					className={cn(OVERLAY_CLASS, layerClassName)}
				/>
				<DialogPrimitive.Popup
					finalFocus={finalFocus}
					className={cn(
						CONTENT_CLASS,
						"bg-background text-foreground sm:max-w-md",
						layerClassName,
						className,
					)}
					style={style}
				>
					<DialogLayerProvider>
						{open ? content : exitingContentRef.current}
					</DialogLayerProvider>
					{showCloseButton && (
						<ModalCloseButton
							sheet={false}
							className="absolute end-4 top-4 bg-secondary"
						/>
					)}
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
