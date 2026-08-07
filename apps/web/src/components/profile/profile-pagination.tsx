import {
	CaretDoubleLeft,
	CaretDoubleRight,
	CaretLeft,
	CaretRight,
} from "@phosphor-icons/react";
import { generatePageNumbers } from "@/components/profile/page-numbers";
import { Button } from "@/components/ui/button";

/** Paging controls shared by the profile tab grids. Renders nothing when
 *  everything fits on one page. */
export function ProfilePagination({
	page,
	totalPages,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex items-center justify-center gap-2 pt-2">
			<Button
				variant="outline"
				size="icon"
				onClick={() => onPageChange(0)}
				disabled={page === 0}
				aria-label="First page"
			>
				<CaretDoubleLeft className="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				onClick={() => onPageChange(Math.max(0, page - 1))}
				disabled={page === 0}
				aria-label="Previous page"
			>
				<CaretLeft className="size-4" />
			</Button>

			<div className="flex items-center gap-2">
				{generatePageNumbers(page, totalPages).map((entry) =>
					entry.type === "ellipsis" ? (
						<span
							key={entry.key}
							className="px-1 text-muted-foreground text-xs"
						>
							...
						</span>
					) : (
						<Button
							key={entry.key}
							variant={page === entry.page ? "default" : "outline"}
							size="icon"
							onClick={() => onPageChange(entry.page)}
							aria-label={`Page ${entry.page + 1}`}
							aria-current={page === entry.page ? "page" : undefined}
						>
							{entry.page + 1}
						</Button>
					),
				)}
			</div>

			<Button
				variant="outline"
				size="icon"
				onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
				disabled={page === totalPages - 1}
				aria-label="Next page"
			>
				<CaretRight className="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				onClick={() => onPageChange(totalPages - 1)}
				disabled={page === totalPages - 1}
				aria-label="Last page"
			>
				<CaretDoubleRight className="size-4" />
			</Button>
		</div>
	);
}
