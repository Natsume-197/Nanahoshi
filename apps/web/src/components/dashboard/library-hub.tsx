import {
	BookOpen,
	BookOpenText,
	Books,
	Buildings,
	CaretRight,
	ChartBar,
	Headphones,
	Microphone,
	Tag,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

/** The big four: where a reader actually goes from here. */
const PRIMARY = [
	{ to: "/dashboard/books", label: m["nav.catalog"], icon: BookOpenText },
	{
		to: "/dashboard/read-listen",
		label: m["nav.read_listen"],
		icon: ReadListenIcon,
	},
	{ to: "/dashboard/series", label: m["nav.series"], icon: Books },
	{ to: "/dashboard/authors", label: m["nav.authors"], icon: User },
] as const;

const SECONDARY = [
	{ to: "/dashboard/genres", label: m["nav.genres"], icon: Tag },
	{ to: "/dashboard/publishers", label: m["nav.publishers"], icon: Buildings },
	{ to: "/dashboard/narrators", label: m["nav.narrators"], icon: Microphone },
	{ to: "/dashboard/stats", label: m["nav.stats"], icon: ChartBar },
] as const;

// Same pressed/hover language as the rest of the app's cards.
const SURFACE =
	"bg-surface-card outline-none transition-colors hover:bg-surface-card-hover focus-visible:ring-3 focus-visible:ring-ring/30";

function SectionHeading({ children }: { children: string }) {
	return (
		<h2 className="px-1 pb-2 font-semibold text-foreground text-lg">
			{children}
		</h2>
	);
}

/** Tile grid for the primary destinations, like the reading-status tiles. */
function PrimaryTiles() {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{PRIMARY.map((item) => {
				const ItemIcon = item.icon;
				return (
					<Link
						key={item.to}
						to={item.to}
						data-pressable="subtle"
						className={cn(
							"flex min-h-24 flex-col justify-between gap-3 rounded-2xl p-4",
							SURFACE,
						)}
					>
						<ItemIcon aria-hidden="true" className="size-6 text-foreground" />
						<span className="font-medium text-sm leading-tight">
							{item.label()}
						</span>
					</Link>
				);
			})}
		</div>
	);
}

/** Inset grouped list: one surface, hairlines between the rows. */
function SecondaryList({ showNarrators }: { showNarrators: boolean }) {
	const items = SECONDARY.filter(
		(item) => item.to !== "/dashboard/narrators" || showNarrators,
	);
	return (
		<div className="overflow-hidden rounded-2xl bg-surface-card">
			{items.map((item, index) => {
				const ItemIcon = item.icon;
				return (
					<Link
						key={item.to}
						to={item.to}
						data-pressable="subtle"
						className="flex min-h-12 items-center gap-3 px-4 outline-none transition-colors hover:bg-surface-card-hover focus-visible:bg-surface-card-hover"
					>
						<ItemIcon
							aria-hidden="true"
							className="size-5 shrink-0 text-muted-foreground"
						/>
						<span
							className={cn(
								"flex min-h-12 flex-1 items-center justify-between gap-3 text-sm",
								index > 0 && "border-border/60 border-t",
							)}
						>
							{item.label()}
							<CaretRight
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
						</span>
					</Link>
				);
			})}
		</div>
	);
}

// Fanned covers, front one largest: the library at a glance.
const FAN = [
	"z-30 start-0 h-16",
	"z-20 start-3 h-14 opacity-80",
	"z-10 start-6 h-12 opacity-60",
] as const;

function CoverFan({
	covers,
	audiobook,
}: {
	covers: string[];
	audiobook: boolean;
}) {
	const filenames = Array.from(
		new Set(
			covers
				.map(getCoverFilename)
				.filter((filename): filename is string => filename !== null),
		),
	).slice(0, 3);
	const FallbackIcon = audiobook ? Headphones : BookOpen;

	if (filenames.length === 0) {
		return (
			<div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
				<FallbackIcon className="size-6" weight="duotone" aria-hidden />
			</div>
		);
	}
	return (
		<div className="relative h-16 w-[4.5rem] shrink-0">
			{filenames.map((filename, index) => (
				<img
					key={filename}
					src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
					srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
					sizes={coverPresets.thumbnail.sizes}
					alt=""
					loading="lazy"
					className={cn(
						"absolute top-1/2 -translate-y-1/2 rounded object-cover ring-1 ring-[var(--image-outline)]",
						audiobook ? "aspect-square" : "aspect-[2/3]",
						FAN[index],
					)}
				/>
			))}
		</div>
	);
}

function LibraryCards() {
	const libraries = useQuery({
		...orpc.libraries.getLibrariesOverview.queryOptions(),
		staleTime: 30_000,
	});

	if (libraries.isLoading) {
		return (
			<div className="flex flex-col gap-2">
				{[0, 1].map((key) => (
					<Skeleton key={key} className="h-24 w-full rounded-2xl" />
				))}
			</div>
		);
	}
	if (!libraries.data?.length) {
		return (
			<p className="rounded-2xl bg-surface-card px-4 py-6 text-center text-muted-foreground text-sm">
				{m["library.none"]()}
			</p>
		);
	}
	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{libraries.data.map((library) => {
				const audiobook = library.mediaType === "audiobook";
				return (
					<Link
						key={library.uuid}
						to="/dashboard/libraries/$uuid"
						params={{ uuid: library.uuid }}
						data-pressable="subtle"
						className={cn("flex items-center gap-4 rounded-2xl p-4", SURFACE)}
					>
						<CoverFan covers={library.previewCovers} audiobook={audiobook} />
						<span className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate font-medium text-base">
								{library.name ?? m["library.untitled"]()}
							</span>
							<span className="text-muted-foreground text-sm tabular-nums">
								{audiobook
									? m["media.audiobook_count"]({ count: library.bookCount })
									: m["media.book_count"]({ count: library.bookCount })}
							</span>
						</span>
						<CaretRight
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					</Link>
				);
			})}
		</div>
	);
}

/**
 * The Library tab: a screen of its own, as in Apple Books or Spotify, rather
 * than a menu sheet over whatever page was open. Everything the desktop
 * sidebar's Browse group and library list hold, sized for a thumb.
 */
export function LibraryHub() {
	// Narrators only exist for audiobooks; hide the row on servers without any.
	const { data: narratorCount } = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
	});

	return (
		<div className={cn(PAGE_SHELL, "flex flex-col gap-8")}>
			<CollectionToolbar title={m["nav.library"]()} titleSize="default" />
			<section className="flex flex-col gap-2">
				<PrimaryTiles />
				<SecondaryList showNarrators={(narratorCount ?? 0) > 0} />
			</section>
			<section>
				<SectionHeading>{m["nav.libraries"]()}</SectionHeading>
				<LibraryCards />
			</section>
		</div>
	);
}
