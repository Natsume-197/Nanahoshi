import { cn } from "@/lib/utils";

function serverInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}


export function ServerBadge({
	name,
	logo,
	className,
}: {
	name: string;
	logo?: string | null;
	className?: string;
}) {
	if (logo) {
		return (
			<img
				src={logo}
				alt=""
				className={cn(
					"size-7 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-white/15 ring-inset",
					className,
				)}
			/>
		);
	}
	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-[10px] text-white shadow-sm ring-1 ring-white/15 ring-inset",
				className,
			)}
		>
			{serverInitials(name)}
		</span>
	);
}
