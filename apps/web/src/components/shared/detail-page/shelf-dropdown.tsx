import { BookMarked, Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
							"h-9 w-full justify-between",
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
											<opt.icon className="size-4" />
											{opt.label}
										</>
									);
								})()
							) : (
								<>
									<BookMarked className="size-4" />
									Add to shelf
								</>
							)}
						</span>
						<ChevronDown className="size-4 text-muted-foreground" />
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
							<opt.icon className="size-4" />
							{opt.label}
							{currentStatus === opt.value && (
								<Check className="ml-auto size-4 text-primary" />
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
								<X className="size-4" />
								Remove from shelf
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
