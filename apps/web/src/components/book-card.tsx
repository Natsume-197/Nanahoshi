import { env } from "@nanahoshi-v2/env/web";
import { Link } from "@tanstack/react-router";

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
			className="group flex flex-col gap-2 rounded-lg p-3 transition-all hover:bg-card"
		>
			<div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-sm transition-all group-hover:scale-[1.01] group-hover:shadow-lg">
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
			</div>
			<div className="min-w-0 space-y-0.5">
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
