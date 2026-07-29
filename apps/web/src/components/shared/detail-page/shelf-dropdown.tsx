import { BookBookmark, CaretDown, Check, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export interface ShelfOption {
	value: string;
	label: string;
	icon: typeof Check;
}

export function ShelfDropdown({
	options,
	currentStatus,
	onSelect,
	onRemove,
}: {
	options: ShelfOption[];
	currentStatus: string | undefined;
	onSelect: (status: string) => void;
	onRemove: () => void;
}) {
	return (
		<div className="mt-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"h-11 w-full justify-between rounded-full active:scale-[0.96] motion-reduce:transition-none",
							currentStatus
								? "border-border bg-muted text-foreground"
								: "border-border bg-muted text-muted-foreground",
						)}
					>
						<span className="flex items-center gap-2">
							{currentStatus ? (
								(() => {
									const opt = options.find((o) => o.value === currentStatus);
									if (!opt) return null;
									return (
										<>
											<opt.icon aria-hidden="true" />
											{opt.label}
										</>
									);
								})()
							) : (
								<>
									<BookBookmark aria-hidden="true" />
									{m["book.add_to_shelf"]()}
								</>
							)}
						</span>
						<CaretDown aria-hidden="true" className="text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					{options.map((opt) => (
						<DropdownMenuItem
							key={opt.value}
							onClick={() => {
								if (currentStatus === opt.value) {
									onRemove();
								} else {
									onSelect(opt.value);
								}
							}}
						>
							<opt.icon />
							{opt.label}
							{currentStatus === opt.value && (
								<Check className="ms-auto text-primary" />
							)}
						</DropdownMenuItem>
					))}
					{currentStatus && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={onRemove}
								className="text-muted-foreground"
							>
								<X />
								{m["book.remove_from_shelf"]()}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
