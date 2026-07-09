import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OVERLAY_CLASS =
	"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/25 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-none";

const CONTENT_CLASS =
	"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-[min(var(--radius-4xl),24px)] bg-popover p-6 text-popover-foreground text-sm shadow-xl outline-none ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-md dark:ring-foreground/10";

const TITLE_CLASS = "font-heading font-medium text-base leading-none";
const DESCRIPTION_CLASS =
	"text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground";

interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
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
	title,
	description,
	children,
	footer,
	onSubmit,
	className,
	showCloseButton = true,
	bare,
}: ModalProps) {
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

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop className={OVERLAY_CLASS} />
				<DialogPrimitive.Popup
					className={cn(
						CONTENT_CLASS,
						"bg-background text-foreground sm:max-w-md",
						className,
					)}
				>
					{content}
					{showCloseButton && (
						<DialogPrimitive.Close
							render={
								<Button
									variant="ghost"
									className="absolute top-4 right-4 bg-secondary"
									size="icon-sm"
								>
									<X />
									<span className="sr-only">Close</span>
								</Button>
							}
						/>
					)}
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
