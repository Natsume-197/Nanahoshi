import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Library, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { coverPresets, getCoverPresetUrl } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/series/")({
	component: SeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(orpc.series.list.queryOptions());
	},
});

function SeriesPage() {
	const { data: seriesList, isLoading } = useQuery({
		...orpc.series.list.queryOptions(),
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="flex items-start gap-3">
				<div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Library className="size-5" />
				</div>
				<div className="space-y-1">
					<h1 className="font-bold text-2xl tracking-tight">Series</h1>
					<p className="text-muted-foreground text-sm">
						Browse book series in your library.
					</p>
				</div>
			</div>

			{isLoading && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading series...
				</div>
			)}

			{!isLoading && seriesList && seriesList.length === 0 && (
				<EmptyState
					icon={<Library className="size-5" />}
					title="No series found"
					description="Series will appear here once your books are enriched with metadata."
					variant="primary"
				/>
			)}

			{seriesList && seriesList.length > 0 && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{seriesList.map((s) => (
						<Link
							key={s.id}
							to="/dashboard/series/$seriesName"
							params={{ seriesName: s.name }}
							className="group block"
						>
							<div className="overflow-hidden rounded-lg">
								{s.cover ? (
									<img
										src={getCoverPresetUrl(
											s.cover.split("/").pop() ?? "",
											coverPresets.card,
										)}
										alt={s.name}
										className="aspect-[2/3] w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-[1.02]"
										loading="lazy"
									/>
								) : (
									<div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-muted/70">
										<Library className="size-8 text-muted-foreground/40" />
									</div>
								)}
							</div>
							<div className="pt-2">
								<p className="line-clamp-2 font-medium text-sm leading-tight">
									{s.name}
								</p>
								<p className="text-muted-foreground text-xs">
									{s.bookCount} {s.bookCount === 1 ? "book" : "books"}
								</p>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
