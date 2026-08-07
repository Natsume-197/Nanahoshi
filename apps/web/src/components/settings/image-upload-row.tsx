import { Camera, CircleNotch } from "@phosphor-icons/react";
import { type ChangeEvent, type ReactNode, type RefObject, useId } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A labeled image slot with a preview, an upload button, and an optional
 * "clear" action. Shared by the user profile settings (avatar/header) and the
 * server branding settings (logo/background).
 */
export function ImageUploadRow({
	variant = "default",
	title,
	description,
	loading,
	inputRef,
	accept,
	onChange,
	uploading,
	preview,
	previewClassName = "size-16 rounded-2xl",
	actionLabel,
	onClear,
	clearing,
	clearLabel,
}: {
	variant?: "default" | "settings";
	title: string;
	description: string;
	loading: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	accept: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	uploading: boolean;
	preview: ReactNode;
	/** Size + rounding of the preview slot ("settings" variant): shapes the click overlay and the loading skeleton. */
	previewClassName?: string;
	actionLabel: string;
	onClear?: () => void;
	clearing?: boolean;
	/** Required alongside `onClear`: the action needs its own label. */
	clearLabel?: string;
}) {
	const descriptionId = useId();
	const fileInput = (
		<input
			ref={inputRef}
			type="file"
			accept={accept}
			className="hidden"
			onChange={onChange}
		/>
	);
	// The "settings" variant already shows a spinner on the preview overlay.
	const showActionSpinner = uploading && variant !== "settings";
	const actions = (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={() => inputRef.current?.click()}
				disabled={loading || uploading}
				aria-describedby={descriptionId}
				aria-busy={uploading || undefined}
			>
				{showActionSpinner && (
					<CircleNotch
						aria-hidden="true"
						data-icon="inline-start"
						className="animate-spin"
					/>
				)}
				{actionLabel}
			</Button>
			{onClear && (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="text-muted-foreground"
					onClick={onClear}
					disabled={clearing}
				>
					{clearing && (
						<CircleNotch
							aria-hidden="true"
							data-icon="inline-start"
							className="animate-spin"
						/>
					)}
					{clearLabel}
				</Button>
			)}
		</div>
	);

	if (variant === "settings") {
		return (
			// The container has to be an ancestor: a container query never matches
			// the element that declares it, so the flex-row variants live one level in.
			<div className="@container/image-row py-4 first:pt-0 last:pb-0">
				<div className="flex @xl/image-row:flex-row flex-col @xl/image-row:items-center @xl/image-row:justify-between @xl/image-row:gap-8 gap-4">
					<div className="flex min-w-0 flex-col gap-1">
						<h3 className="font-medium text-base text-foreground">{title}</h3>
						<p
							id={descriptionId}
							className="max-w-xl text-pretty text-muted-foreground text-sm leading-relaxed"
						>
							{description}
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap items-center @xl/image-row:justify-end gap-4">
						{loading ? (
							<Skeleton className={cn("shrink-0", previewClassName)} />
						) : (
							<button
								type="button"
								onClick={() => inputRef.current?.click()}
								disabled={uploading}
								aria-label={actionLabel}
								aria-describedby={descriptionId}
								aria-busy={uploading || undefined}
								className={cn(
									"group/preview relative shrink-0 cursor-pointer overflow-hidden outline-none ring-1 ring-[var(--image-outline)] transition-transform focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] motion-reduce:transition-none",
									previewClassName,
								)}
							>
								{preview}
								<span
									className={cn(
										"absolute inset-0 flex items-center justify-center bg-black/50 text-white transition-opacity duration-150 motion-reduce:transition-none",
										uploading
											? "opacity-100"
											: "opacity-0 group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100",
									)}
								>
									{uploading ? (
										<CircleNotch
											aria-hidden="true"
											className="size-5 animate-spin"
										/>
									) : (
										<Camera aria-hidden="true" className="size-5" />
									)}
								</span>
							</button>
						)}
						{fileInput}
						{actions}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-border/60 bg-card/50 p-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				{loading ? <Skeleton className="size-16 rounded-full" /> : preview}
				<div className="flex min-w-0 flex-1 flex-col gap-3">
					<div className="flex flex-col gap-1">
						<h3 className="font-medium text-sm">{title}</h3>
						<p
							id={descriptionId}
							className="text-pretty text-muted-foreground text-sm leading-relaxed"
						>
							{description}
						</p>
					</div>
					{fileInput}
					{actions}
				</div>
			</div>
		</div>
	);
}
