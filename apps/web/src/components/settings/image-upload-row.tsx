import { Loader2 } from "lucide-react";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";

/**
 * A labeled image slot with a preview, an upload button, and an optional
 * "clear" action. Shared by the user profile settings (avatar/header) and the
 * server branding settings (logo/background).
 */
export function ImageUploadRow({
	title,
	description,
	loading,
	inputRef,
	accept,
	onChange,
	uploading,
	preview,
	actionLabel,
	onClear,
	clearing,
	clearLabel,
}: {
	title: string;
	description: string;
	loading: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	accept: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	uploading: boolean;
	preview: ReactNode;
	actionLabel: string;
	onClear?: () => void;
	clearing?: boolean;
	clearLabel?: string;
}) {
	return (
		<div className="rounded-2xl border border-border/60 bg-card/50 p-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				{loading ? <Skeleton className="size-16 rounded-full" /> : preview}
				<div className="min-w-0 flex-1 space-y-1">
					<div>
						<h4 className="font-medium text-sm">{title}</h4>
						<p className="text-muted-foreground text-sm">{description}</p>
					</div>
					<input
						ref={inputRef}
						type="file"
						accept={accept}
						className="hidden"
						onChange={onChange}
					/>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={loading || uploading}
						>
							{uploading && (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
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
									<Loader2 className="mr-1.5 size-3.5 animate-spin" />
								)}
								{clearLabel ?? m["settings.profile.use_account_default"]()}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
