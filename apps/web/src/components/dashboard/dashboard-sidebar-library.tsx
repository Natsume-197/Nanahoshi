import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Headphones, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type LibraryFilter = "collections" | "libraries";

// pl-3 lines the thumbnail up with the nav item icons (group p-2 + px-3).
const rowClass = (active: boolean) =>
	cn(
		"flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-3",
		"transition-colors hover:bg-sidebar-accent/60",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		active && "bg-sidebar-accent",
	);

const nameClass = (active: boolean) =>
	cn(
		"truncate font-medium text-[13px] leading-tight",
		active ? "text-primary" : "text-sidebar-foreground",
	);

function readStoredFilter(): LibraryFilter {
	if (typeof window === "undefined") return "collections";
	return window.localStorage.getItem("nh-sidebar-filter") === "libraries"
		? "libraries"
		: "collections";
}

export function DashboardSidebarLibrary({
	locationPathname,
	onNavigate,
}: {
	locationPathname: string;
	onNavigate: () => void;
}) {
	const [filter, setFilter] = useState<LibraryFilter>(readStoredFilter);
	const switchFilter = (f: LibraryFilter) => {
		setFilter(f);
		if (typeof window !== "undefined") {
			window.localStorage.setItem("nh-sidebar-filter", f);
		}
	};

	// Only the active tab fetches; collections is the same query the rest of the
	// app uses, so React Query dedupes it.
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: filter === "collections",
	});
	const libraries = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: filter === "libraries",
	});

	const isLoading =
		filter === "collections" ? collections.isLoading : libraries.isLoading;

	return (
		<SidebarGroup className="flex min-h-0 flex-1 flex-col pt-0">
			{/* header — matches SidebarGroupLabel typography (see Browse) */}
			<div className="flex h-8 items-center pr-1.5 pl-3 group-data-[collapsible=icon]:hidden">
				<span className="flex-1 font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Your Library
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="New collection"
					className="size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground"
				>
					<Plus className="size-4" />
				</Button>
			</div>

			{/* filter chips */}
			<div className="flex gap-1.5 px-3 pt-1 pb-2.5 group-data-[collapsible=icon]:hidden">
				{(["collections", "libraries"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => switchFilter(f)}
						aria-pressed={filter === f}
						className={cn(
							"rounded-full px-2.5 py-1.5 font-semibold text-xs capitalize transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
							filter === f
								? "bg-sidebar-foreground text-sidebar"
								: "bg-sidebar-accent text-sidebar-foreground/80 hover:bg-sidebar-accent/70",
						)}
					>
						{f}
					</button>
				))}
			</div>

			{/* list — the only part of the sidebar that scrolls */}
			<div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
				{isLoading ? (
					<>
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
					</>
				) : filter === "collections" ? (
					collections.data?.length ? (
						collections.data.map((c) => {
							const active = locationPathname.startsWith(
								`/dashboard/collections/${c.id}`,
							);
							const coverFilename = getCoverFilename(c.previewCovers?.[0]);
							return (
								<Link
									key={c.id}
									to="/dashboard/collections/$collectionId"
									params={{ collectionId: c.id }}
									preload="intent"
									onClick={onNavigate}
									className={rowClass(active)}
								>
									<div className="size-10 flex-none overflow-hidden rounded-md bg-muted">
										{coverFilename && (
											<img
												src={getCoverPresetUrl(
													coverFilename,
													coverPresets.thumbnail,
												)}
												alt=""
												className="h-full w-full object-cover"
												loading="lazy"
												decoding="async"
											/>
										)}
									</div>
									<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
										<p className={nameClass(active)}>{c.name}</p>
										<p className="mt-0.5 truncate text-sidebar-foreground/50 text-xs">
											Collection · {c.bookCount} items
										</p>
									</div>
								</Link>
							);
						})
					) : (
						<p className="px-3 py-3 text-sidebar-foreground/50 text-xs">
							No collections yet
						</p>
					)
				) : libraries.data?.length ? (
					// Libraries have no "books in this library" route yet, so rows are
					// informational. Swap this <div> for a TanStack <Link> once a route
					// like /dashboard/libraries/$libraryId exists.
					libraries.data.map((lib) => {
						const Icon = lib.mediaType === "audiobook" ? Headphones : BookOpen;
						return (
							<div
								key={lib.id}
								className="flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-3"
							>
								<div className="grid size-10 flex-none place-items-center rounded-md bg-sidebar-accent text-sidebar-foreground/70">
									<Icon className="size-[1.125rem]" />
								</div>
								<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
									<p className={nameClass(false)}>{lib.name}</p>
									<p className="mt-0.5 truncate text-sidebar-foreground/50 text-xs capitalize">
										Library · {lib.mediaType}
									</p>
								</div>
							</div>
						);
					})
				) : (
					<p className="px-3 py-3 text-sidebar-foreground/50 text-xs">
						No libraries yet
					</p>
				)}
			</div>
		</SidebarGroup>
	);
}
