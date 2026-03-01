import { env } from "@nanahoshi-v2/env/web";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

interface BookCardProps {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	authors?: { name: string }[];
}

export function BookCard({
	uuid,
	title,
	filename,
	cover,
	authors,
}: BookCardProps) {
	const coverFilename = cover?.split("/").pop();
	const displayTitle = title ?? filename;
	const authorText = authors?.map((a) => a.name).join(", ");

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid }}
			className="group flex flex-col gap-2 rounded-lg p-2 transition-all"
		>
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-black/40 group-hover:shadow-xl">
				{coverFilename ? (
					<img
						src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=440&height=660`}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
						No cover
					</div>
				)}
				{/* Hover scrim + overlay button */}
				<div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
				<div className="absolute right-2 bottom-2 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform hover:scale-110 active:scale-95">
						<BookOpen className="size-5 text-primary-foreground" />
					</div>
				</div>
			</div>
			<div className="min-w-0 space-y-0.5 px-0.5">
				<p className="line-clamp-2 font-medium text-sm leading-tight">
					{displayTitle}
				</p>
				{authorText && (
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{authorText}
					</p>
				)}
			</div>
		</Link>
	);
}
