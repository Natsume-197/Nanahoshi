import { BookmarkPlus, Check, ListTodo, Timer } from "lucide-react";
import { BookCollectionsPanel } from "./book-collections-panel";

const SHELF_OPTIONS: Array<{
	value: string;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "read", label: "Leido", icon: Check },
	{ value: "reading", label: "Leyendo", icon: Timer },
	{ value: "backlog", label: "Backlog", icon: ListTodo },
	{ value: "want_to_read", label: "Quiero leer", icon: BookmarkPlus },
];

interface BookSidebarActionsProps {
	bookUuid: string;
}

export function BookSidebarActions({ bookUuid }: BookSidebarActionsProps) {
	return (
		<div className="space-y-4">
			{/* Estado — pills inline */}
			<section className="space-y-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Estado
				</h2>
				<div className="flex flex-wrap gap-1.5">
					{SHELF_OPTIONS.map((option) => {
						const Icon = option.icon;
						return (
							<button
								key={option.value}
								type="button"
								className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-3 text-muted-foreground text-xs transition-colors hover:bg-muted/80 hover:text-foreground aria-pressed:border-primary/50 aria-pressed:bg-primary/10 aria-pressed:text-primary"
								aria-pressed={false}
							>
								<Icon className="size-3" />
								{option.label}
							</button>
						);
					})}
				</div>
			</section>

			{/* Collections — tag chips */}
			<section className="space-y-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Collections
				</h2>
				<BookCollectionsPanel bookUuid={bookUuid} />
			</section>
		</div>
	);
}
