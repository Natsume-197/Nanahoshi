import { useQuery } from "@tanstack/react-query";
import { useMatches } from "@tanstack/react-router";
import { type CSSProperties, useRef } from "react";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { likedBooksQueryOptions } from "@/hooks/books/liked-books-query";
import { cn } from "@/lib/utils";

function readLoaderBloom(loaderData: unknown): string | null {
	if (!loaderData || typeof loaderData !== "object") return null;
	const data = loaderData as {
		book?: { mainColor?: string | null };
		audiobook?: { mainColor?: string | null };
	};
	return data.book?.mainColor ?? data.audiobook?.mainColor ?? null;
}

export function useAmbientBloomColor(pathname: string): string | null {
	const isHome = pathname === "/dashboard";
	const isLikes = pathname.startsWith("/dashboard/likes");
	const matches = useMatches();

	const { data: readingEntries } = useQuery({
		...continueReadingQueryOptions(),
		enabled: isHome,
	});
	const { data: likedBooks } = useQuery({
		...likedBooksQueryOptions(),
		enabled: isLikes,
	});

	if (isHome) {
		return readingEntries?.find((e) => e.mainColor)?.mainColor ?? null;
	}
	if (isLikes) {
		return likedBooks?.find((b) => b.mainColor)?.mainColor ?? null;
	}
	for (let i = matches.length - 1; i >= 0; i--) {
		const color = readLoaderBloom(matches[i].loaderData);
		if (color) return color;
	}
	return null;
}

export function AmbientBloom({ color }: { color: string | null | undefined }) {
	const lastColorRef = useRef(color ?? null);
	if (color) lastColorRef.current = color;
	const displayColor = color ?? lastColorRef.current;

	return (
		<div
			aria-hidden
			style={
				displayColor
					? ({
							"--bloom": `color-mix(in oklab, ${displayColor} 24%, transparent)`,
						} as CSSProperties)
					: undefined
			}
			className={cn(
				"pointer-events-none fixed inset-x-0 top-0 z-40 h-96 bg-[radial-gradient(120%_100%_at_50%_-30%,var(--bloom),transparent_70%)] duration-700 ease-out [transition-property:--bloom,opacity]",
				color ? "opacity-100" : "opacity-0",
			)}
		/>
	);
}
