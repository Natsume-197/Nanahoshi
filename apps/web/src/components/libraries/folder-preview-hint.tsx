import { CircleNotch, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export type FolderPreview = {
	state: string;
	ebooks: number;
	audiobooks: number;
	partial: boolean;
};

/** "We found 312 books and 40 audiobooks." — null when there's nothing. */
export function folderFoundText(preview: FolderPreview): string | null {
	if (preview.state !== "ok") return null;
	const parts: string[] = [];
	if (preview.ebooks > 0)
		parts.push(m["onboarding.count_books"]({ count: preview.ebooks }));
	if (preview.audiobooks > 0)
		parts.push(m["onboarding.count_audiobooks"]({ count: preview.audiobooks }));
	const [first, second] = parts;
	if (!first) return null;
	const what = second ? m["onboarding.found_and"]({ first, second }) : first;
	return preview.partial
		? m["onboarding.found_at_least"]({ what })
		: m["onboarding.found"]({ what });
}

/** What a folder holds, or why Nanahoshi can't open it, before any library
 * is made from it. `path` should already be settled (not every keystroke). */
export function FolderPreviewHint({
	path,
}: {
	path: string;
}): JSX.Element | null {
	const preview = useQuery({
		...orpc.files.previewFolder.queryOptions({ input: { location: path } }),
		enabled: path.startsWith("/") && path !== "/",
		staleTime: 30_000,
		retry: false,
	});
	if (!path.startsWith("/") || path === "/") return null;
	if (preview.isPending)
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<CircleNotch aria-hidden className="size-4 animate-spin" />
				{m["onboarding.books_looking"]()}
			</p>
		);
	if (preview.data?.state !== "ok")
		return (
			<p
				role="alert"
				className="flex gap-2 text-destructive text-sm leading-relaxed"
			>
				<Warning aria-hidden className="mt-0.5 size-4 shrink-0" />
				{m["onboarding.folder_unreadable"]()}
			</p>
		);
	const found = folderFoundText(preview.data);
	return (
		<p
			className={found ? "text-sm" : "text-muted-foreground text-sm"}
			aria-live="polite"
		>
			{found ?? m["onboarding.empty_folder"]()}
		</p>
	);
}
