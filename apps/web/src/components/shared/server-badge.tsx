import { cn } from "@/lib/utils";

function serverInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

// Deterministic gradient per server, in the brand's green→teal→blue family so
// it reads on-brand and stays distinct from the pink/violet user avatars. 700
// stops keep the white initials legible (≥4.5:1) across the whole chip.
const SERVER_GRADIENTS = [
	"linear-gradient(135deg, #047857, #0f766e)", // emerald → teal
	"linear-gradient(135deg, #15803d, #047857)", // green → emerald
	"linear-gradient(135deg, #0f766e, #0e7490)", // teal → cyan
	"linear-gradient(135deg, #0e7490, #1d4ed8)", // cyan → blue
	"linear-gradient(135deg, #1d4ed8, #4338ca)", // blue → indigo
];

function serverGradient(name: string) {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return SERVER_GRADIENTS[Math.abs(hash) % SERVER_GRADIENTS.length];
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
			style={{ background: serverGradient(name) }}
		>
			{serverInitials(name)}
		</span>
	);
}
