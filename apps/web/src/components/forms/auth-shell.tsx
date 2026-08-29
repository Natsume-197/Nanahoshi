import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const authInputClass = "h-11 border-border bg-input";

export const authButtonClass = "h-11 w-full";

const authLabelClass = "font-medium text-sm";

export const authLinkClass =
	"font-medium text-foreground underline-offset-4 hover:underline";

export const authNoticeClass =
	"rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm";

export function AuthField({
	label,
	name,
	...input
}: {
	label: ReactNode;
	name: string;
} & Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"className" | "id" | "name" | "required"
>) {
	return (
		<div className="space-y-2">
			<Label htmlFor={name} className={authLabelClass}>
				{label}
			</Label>
			<Input
				{...input}
				id={name}
				name={name}
				className={authInputClass}
				required
			/>
		</div>
	);
}

export function AuthShell({
	title,
	subtitle,
	notice,
	children,
	footer,
	className,
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	notice?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<section className={cn("w-full max-w-md", className)}>
				<header className="space-y-2">
					<h1 className="font-bold text-4xl tracking-tight">{title}</h1>
					{subtitle && (
						<p className="text-muted-foreground leading-relaxed">{subtitle}</p>
					)}
					{notice}
				</header>

				<div className="mt-8">{children}</div>
				{footer && (
					<footer className="mt-6 text-muted-foreground text-sm">
						{footer}
					</footer>
				)}
			</section>
		</main>
	);
}

export function AuthDivider({ children }: { children: ReactNode }) {
	return (
		<div className="relative my-6">
			<div className="absolute inset-0 flex items-center" aria-hidden="true">
				<span className="w-full border-t" />
			</div>
			<div className="relative flex justify-center text-xs uppercase">
				<span className="bg-background px-2 text-muted-foreground">
					{children}
				</span>
			</div>
		</div>
	);
}
