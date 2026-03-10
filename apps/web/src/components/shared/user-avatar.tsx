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

	return (
		<div className={cn("overflow-hidden rounded-full bg-muted", className)}>
			{showImage ? (
				<img
					src={image ?? undefined}
					alt={name ? `${name} avatar` : "User avatar"}
					className={cn("h-full w-full object-cover", imageClassName)}
					loading="lazy"
					decoding="async"
					onError={() => setFailedImage(image ?? null)}
				/>
			) : (
				<div
					className={cn(
						"flex h-full w-full items-center justify-center font-semibold text-foreground",
						fallbackClassName,
					)}
				>
					{getInitials(name)}
				</div>
			)}
		</div>
	);
}
