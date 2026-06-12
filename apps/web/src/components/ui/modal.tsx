import type { FormEvent, ReactNode } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
	showCloseButton?: boolean;
}

/**
 * Generic dialog wrapper over the Radix `Dialog` primitives: standard header
 * (title + optional description), body and footer. Pass `onSubmit` to turn it
 * into a form modal. For destructive confirmations use `AlertDialog` instead.
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
	showCloseButton,
}: ModalProps) {
	const body = (
		<>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				{description && <DialogDescription>{description}</DialogDescription>}
			</DialogHeader>
			{children}
			{footer && <DialogFooter>{footer}</DialogFooter>}
		</>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn("bg-background text-foreground sm:max-w-md", className)}
				showCloseButton={showCloseButton}
				overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
			>
				{onSubmit ? (
					<form className="grid gap-6" onSubmit={onSubmit}>
						{body}
					</form>
				) : (
					body
				)}
			</DialogContent>
		</Dialog>
	);
}
