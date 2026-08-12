import { ArrowClockwise, House, Warning } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
	title?: string;
	description?: string;
	/** Optional technical detail shown in a muted box (e.g. error message). */
	detail?: string;
	/** When true, shows a "Try again" button that re-invalidates the router. */
	showRetry?: boolean;
}

export function ErrorPage({
	title = "Something went wrong",
	description = "An unexpected error occurred while loading this page. You can try again or head back home.",
	detail,
	showRetry = true,
}: ErrorPageProps) {
	const router = useRouter();

	return (
		<main className="flex min-h-dvh items-center justify-center bg-background ps-[max(1rem,var(--safe-area-left))] pe-[max(1rem,var(--safe-area-right))] pt-[max(3rem,calc(var(--safe-area-top)+1rem))] pb-[max(3rem,calc(var(--safe-area-bottom)+1rem))]">
			<div className="w-full max-w-md">
				<div className="space-y-2">
					<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
						<Warning className="size-6" />
					</div>
					<h1 className="font-bold text-4xl tracking-tight">{title}</h1>
					<p className="text-muted-foreground leading-relaxed">{description}</p>
				</div>

				{detail ? (
					<pre className="mt-6 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-input/40 p-3 text-muted-foreground text-xs">
						{detail}
					</pre>
				) : null}

				<div className="mt-8 flex flex-col gap-3 sm:flex-row">
					{showRetry ? (
						<Button
							type="button"
							className="h-11 flex-1 bg-foreground font-semibold text-background hover:bg-foreground/90"
							onClick={() => router.invalidate()}
						>
							<ArrowClockwise className="mr-2 size-4" />
							Try again
						</Button>
					) : null}
					<Button asChild variant="outline" className="h-11 flex-1">
						<Link to="/">
							<House className="mr-2 size-4" />
							Go home
						</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}

export function NotFoundPage() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background ps-[max(1rem,var(--safe-area-left))] pe-[max(1rem,var(--safe-area-right))] pt-[max(3rem,calc(var(--safe-area-top)+1rem))] pb-[max(3rem,calc(var(--safe-area-bottom)+1rem))]">
			<div className="w-full max-w-md">
				<div className="space-y-2">
					<p className="font-bold text-7xl text-muted-foreground/40 tracking-tight">
						404
					</p>
					<h1 className="font-bold text-4xl tracking-tight">Page not found</h1>
					<p className="text-muted-foreground leading-relaxed">
						The page you're looking for doesn't exist or may have been moved.
					</p>
				</div>

				<div className="mt-8">
					<Button
						asChild
						className="h-11 w-full bg-foreground font-semibold text-background hover:bg-foreground/90"
					>
						<Link to="/">
							<House className="mr-2 size-4" />
							Go home
						</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
