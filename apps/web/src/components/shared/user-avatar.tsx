import { useState } from "react";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null) {
	if (!name) return "?";

	const initials = name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	return initials || "?";
}

// Curated, vibrant gradient palette (modal.com-style) — picked deterministically
// from the name so the same user always gets the same color.
const AVATAR_GRADIENTS = [
	"linear-gradient(135deg, #8b5cf6, #ec4899)", // violet → pink
	"linear-gradient(135deg, #a855f7, #d946ef)", // purple → fuchsia
	"linear-gradient(135deg, #d946ef, #f472b6)", // fuchsia → pink
	"linear-gradient(135deg, #7c3aed, #db2777)", // violet → rose-pink
	"linear-gradient(135deg, #c026d3, #ec4899)", // fuchsia → pink
	"linear-gradient(135deg, #9333ea, #e879f9)", // purple → light fuchsia
];

function getAvatarGradient(name?: string | null) {
	const key = name?.trim() || "?";
	let hash = 0;
	for (let i = 0; i < key.length; i++) {
		hash = key.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function UserAvatar({
	name,
	image,
	className,
	fallbackClassName,
	imageClassName,
}: {
	name?: string | null;
	image?: string | null;
	className?: string;
	fallbackClassName?: string;
	imageClassName?: string;
}) {
	const [failedImage, setFailedImage] = useState<string | null>(null);
	const showImage = Boolean(image) && image !== failedImage;
	// Respect callers that intentionally set their own background.
	const hasCustomBg = fallbackClassName?.includes("bg-") ?? false;
	const useGradient = !hasCustomBg;

	return (
		<div
			className={cn(
				"relative",
				className,
				showImage
					? "overflow-visible rounded-none bg-transparent"
					: "overflow-hidden rounded-full bg-muted",
			)}
		>
			{showImage ? (
				<img
					src={image ?? undefined}
					alt={name ? `${name} avatar` : "User avatar"}
					className={cn("block h-full w-full object-contain", imageClassName)}
					loading="lazy"
					decoding="async"
					onError={() => setFailedImage(image ?? null)}
				/>
			) : (
				<div
					className={cn(
						"flex h-full w-full items-center justify-center font-semibold leading-none",
						useGradient ? "text-white" : "text-foreground",
						fallbackClassName,
					)}
					style={
						useGradient ? { background: getAvatarGradient(name) } : undefined
					}
				>
					{getInitials(name)}
				</div>
			)}
		</div>
	);
}
