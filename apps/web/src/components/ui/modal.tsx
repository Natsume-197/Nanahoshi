import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import {
	createContext,
	type FormEvent,
	type ReactNode,
	useContext,
	useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const OVERLAY_CLASS =
	"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/25 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-none";

// Tall bodies scroll inside the popup instead of running off the viewport;
// callers that want a different cap just pass their own max-h/overflow.
const CONTENT_CLASS =
	"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto overscroll-contain rounded-[min(var(--radius-4xl),24px)] bg-popover p-6 text-popover-foreground text-sm shadow-xl outline-none ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-md dark:ring-foreground/10";

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
	/** Show the built-in close (X) button. Defaults to true. */
	showCloseButton?: boolean;
	/**
	 * Chrome-less mode: renders only `children` (no visible header/footer),
	 * keeping an sr-only title/description for accessibility. Use for modals with
	 * a fully custom layout such as an image lightbox or a file browser.
	 */
	bare?: boolean;
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
	showCloseButton = true,
	bare,
}: ModalProps) {
	const nested = useContext(DialogLayerContext);
	const previouslyOpenRef = useRef(false);
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
	previouslyOpenRef.current = open;

	const content = bare ? (
		<>
			<DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
			{description && (
				<DialogPrimitive.Description className="sr-only">
					{description}
				</DialogPrimitive.Description>
			)}
			{children}
		</>
	) : (
		(() => {
			const body = (
				<>
					<div className="flex flex-col gap-1.5">
						<DialogPrimitive.Title className={TITLE_CLASS}>
							{title}
						</DialogPrimitive.Title>
						{description && (
							<DialogPrimitive.Description className={DESCRIPTION_CLASS}>
								{description}
							</DialogPrimitive.Description>
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

	return (
		<DialogPrimitive.Root
			open={open}
			onOpenChange={(nextOpen, eventDetails) => {
				closedWithEscapeRef.current =
					!nextOpen && eventDetails.reason === "escape-key";
				onOpenChange(nextOpen);
			}}
			onOpenChangeComplete={onOpenChangeComplete}
			modal={nested ? "trap-focus" : true}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop
					forceRender
					data-slot="modal-backdrop"
					className={OVERLAY_CLASS}
				/>
				<DialogPrimitive.Popup
					finalFocus={() => {
						const returnFocus = returnFocusRef.current;
						const canRestoreFocus = returnFocus?.isConnected === true;
						if (closedWithEscapeRef.current && canRestoreFocus) {
							suppressRestoredFocusIndicator(returnFocus);
						}
						return canRestoreFocus ? returnFocus : true;
					}}
					className={cn(
						CONTENT_CLASS,
						"bg-background text-foreground sm:max-w-md",
						className,
					)}
				>
					<DialogLayerProvider>
						{open ? content : exitingContentRef.current}
					</DialogLayerProvider>
					{showCloseButton && (
						<DialogPrimitive.Close
							render={
								<Button
									variant="ghost"
									className="absolute end-4 top-4 bg-secondary"
									size="icon-sm"
								>
									<X />
									<span className="sr-only">{m["common.close"]()}</span>
								</Button>
							}
						/>
					)}
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
