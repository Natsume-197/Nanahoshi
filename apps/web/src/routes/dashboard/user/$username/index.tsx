import { PencilSimple } from "@phosphor-icons/react";
import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useRef } from "react";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { SectionSkeleton } from "@/components/dashboard/home/section-skeleton";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsPage } from "@/components/layout/settings-modal-host";
import {
	AudiobookShelfSections,
	type AudiobookShelfStatus,
	BookShelfSections,
	type ShelfStatus,
	useProfileAudiobookShelves,
	useProfileShelves,
} from "@/components/profile/book-shelf-sections";
import { ProfileAudiobooksGrid } from "@/components/profile/profile-audiobooks-grid";
import { ProfileBooksGrid } from "@/components/profile/profile-books-grid";
import { ProfileLikesGrid } from "@/components/profile/profile-likes-grid";
import {
	type LikedFormat,
	parseRequestedProfileTab,
	type RequestedProfileTab,
	resolveProfileTab,
} from "@/components/profile/profile-tabs";
import {
	CollectionCard,
	CollectionCardSkeleton,
} from "@/components/shared/collection-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbilities } from "@/hooks/use-abilities";
import {
	resolveCollectionPreview,
	useCollectionPreviews,
} from "@/hooks/use-collection-previews";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { getHeaderImageSources } from "@/utils/profile-images";

const SHELF_STATUS_VALUES: ShelfStatus[] = [
	"want_to_read",
	"backlog",
	"reading",
	"completed",
];

const AUDIOBOOK_SHELF_STATUS_VALUES: AudiobookShelfStatus[] = [
	"want_to_listen",
	"backlog",
	"listening",
	"completed",
];

const PROFILE_TAB_TRIGGER_CLASS =
	"h-full flex-1 rounded-none px-2 py-0 text-xs after:rounded-full group-data-horizontal/tabs:after:inset-x-2 group-data-horizontal/tabs:after:bottom-0 sm:flex-none sm:px-5 sm:text-sm";

export const Route = createFileRoute("/dashboard/user/$username/")({
	component: UserProfilePage,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		tab?: RequestedProfileTab;
		shelf?: ShelfStatus;
		audiobookShelf?: AudiobookShelfStatus;
		likedFormat?: LikedFormat;
	} => ({
		// Ownership isn't known here, so `tab=likes` is merely accepted; the
		// component is what refuses to render it on someone else's profile.
		tab: parseRequestedProfileTab(search.tab),
		shelf: SHELF_STATUS_VALUES.includes(search.shelf as ShelfStatus)
			? (search.shelf as ShelfStatus)
			: undefined,
		audiobookShelf: AUDIOBOOK_SHELF_STATUS_VALUES.includes(
			search.audiobookShelf as AudiobookShelfStatus,
		)
			? (search.audiobookShelf as AudiobookShelfStatus)
			: undefined,
		likedFormat:
			search.likedFormat === "books" || search.likedFormat === "audiobooks"
				? search.likedFormat
				: undefined,
	}),
	loader: ({ params: { username }, context }) => {
		if (typeof window === "undefined") return;
		const session = context.session;
		const isOwnProfile =
			(session?.user as { username?: string } | undefined)?.username ===
			username;

		const profileQuery = isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({ input: { username } });

		context.queryClient.prefetchQuery(profileQuery);
		// Calienta las pestañas para que el primer cambio no caiga en skeleton:
		// son las mismas keys que usan los grids (limit 40, offset 0, sin filtro).
		context.queryClient.prefetchQuery(
			orpc.bookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, limit: 40, offset: 0 },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, limit: 40, offset: 0 },
			}),
		);
		if (isOwnProfile) {
			context.queryClient.prefetchQuery(
				orpc.likedBooks.listLiked.queryOptions({
					input: { limit: 40, cursor: 0, format: "books" },
				}),
			);
			context.queryClient.prefetchQuery(
				orpc.likedBooks.count.queryOptions({
					input: { format: "books" },
				}),
			);
		}
	},
	pendingComponent: ProfileSkeleton,
});

function UserProfilePage() {
	const { username } = useParams({ from: "/dashboard/user/$username/" });
	const { tab, shelf, audiobookShelf, likedFormat } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tabsNavRef = useRef<HTMLDivElement>(null);
	const queryClient = useQueryClient();
	// Prefetch al pasar el cursor / enfocar: si el loader no calentó esta
	// combinación (p. ej. con filtro de estantería), el hover la deja en caché
	// antes del clic y no se ve el skeleton.
	const prefetchBooksTab = () => {
		void queryClient.prefetchQuery(
			orpc.bookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status: shelf, limit: 40, offset: 0 },
			}),
		);
	};
	const prefetchAudiobooksTab = () => {
		void queryClient.prefetchQuery(
			orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status: audiobookShelf, limit: 40, offset: 0 },
			}),
		);
	};
	const prefetchLikesTab = () => {
		const format = likedFormat ?? "books";
		void queryClient.prefetchQuery(
			orpc.likedBooks.listLiked.queryOptions({
				input: { limit: 40, cursor: 0, format },
			}),
		);
		void queryClient.prefetchQuery(
			orpc.likedBooks.count.queryOptions({ input: { format } }),
		);
	};
	const { openSettings } = useSettingsModal();
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const { session } = Route.useRouteContext();
	const sessionUsername = (session.user as { username?: string }).username;
	const isOwnProfile = !!sessionUsername && sessionUsername === username;
	const activeTab = resolveProfileTab({ requestedTab: tab, isOwnProfile });
	const isOverviewTab = activeTab === "overview";

	const profileQuery = useSuspenseQuery(
		isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({
					input: { username },
				}),
	);

	const shelves = useProfileShelves(username);
	const audiobookShelves = useProfileAudiobookShelves(username);
	const canReadCollections = can("collection", "read");
	const publicCollectionsQuery = useQuery({
		...orpc.collections.listPublic.queryOptions({
			input: { username, limit: 4 },
		}),
		enabled: isOverviewTab && !abilitiesLoading && canReadCollections,
	});
	const publicCollectionPreviews = useCollectionPreviews(
		publicCollectionsQuery.data?.map((collection) => collection.id) ?? [],
		isOverviewTab && !abilitiesLoading && canReadCollections,
	);

	const profile = profileQuery.data;

	const displayUsername =
		(profile && "displayUsername" in profile
			? profile.displayUsername
			: undefined) ?? username;
	const profileName = profile?.name?.trim() || displayUsername;

	const headerUrl =
		(profile && "headerImage" in profile ? profile.headerImage : undefined) ??
		null;
	const headerImageSources =
		typeof headerUrl === "string" ? getHeaderImageSources(headerUrl) : null;
	// On mobile this page IS the account tab — the bottom bar navigates straight
	// here and there's no navbar avatar down there — so the menu carries status,
	// invitations, settings and sign out at every size.
	const actionButton = isOwnProfile ? (
		<div className="flex items-center gap-2">
			<Button
				variant="secondary"
				size="sm"
				aria-label={m["user_profile.edit_profile"]()}
				onPointerEnter={preloadSettingsPage}
				onClick={() => openSettings("profile")}
				className="gap-2 rounded-full px-3 sm:px-4"
			>
				<PencilSimple className="size-4" />
				<span className="hidden sm:inline">
					{m["user_profile.edit_profile"]()}
				</span>
			</Button>
			<AccountMenu />
		</div>
	) : null;

	const publicCollectionsSection =
		!abilitiesLoading &&
		canReadCollections &&
		(publicCollectionsQuery.isLoading ||
			Boolean(publicCollectionsQuery.data?.length)) ? (
			<section className="flex min-w-0 flex-col gap-5 border-border/60 border-t pt-8">
				<h2 className="font-semibold text-xl tracking-tight">
					Public Collections
				</h2>
				{publicCollectionsQuery.isLoading ? (
					<div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
						{[
							"collection-1",
							"collection-2",
							"collection-3",
							"collection-4",
						].map((key) => (
							<CollectionCardSkeleton key={key} />
						))}
					</div>
				) : (
					<div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
						{publicCollectionsQuery.data?.map((collection) => {
							const preview = resolveCollectionPreview(
								collection,
								publicCollectionPreviews.byId.get(collection.id),
							);
							return (
								<CollectionCard
									key={collection.id}
									id={collection.id}
									name={collection.name}
									previewCovers={preview.previewCovers}
									subtitle={m["media.item_count"]({
										count: preview.count ?? 0,
									})}
									readOnly
									isDynamic={collection.kind === "dynamic"}
								/>
							);
						})}
					</div>
				)}
			</section>
		) : null;

	return (
		<div className={cn(PAGE_GUTTER, "pt-4 pb-12 sm:pt-6")}>
			<div className="mx-auto max-w-[1400px]">
				<header>
					<div className="relative h-40 overflow-hidden rounded-2xl bg-muted sm:h-56 lg:h-64">
						{headerImageSources ? (
							<img
								{...headerImageSources}
								alt=""
								className="h-full w-full object-cover"
								decoding="async"
							/>
						) : (
							<div
								aria-hidden="true"
								className="absolute inset-0 bg-gradient-to-br from-primary/15 via-muted to-primary/5"
							>
								<div className="absolute -top-36 -right-12 size-96 rounded-full border border-foreground/5 sm:size-[32rem]" />
								<div className="absolute -top-20 -right-28 size-96 rounded-full border border-foreground/5 sm:size-[32rem]" />
							</div>
						)}
					</div>
					<div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4 gap-y-5 px-2 pb-7 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:px-6 sm:pb-8">
						<UserAvatar
							name={profileName}
							image={profile?.image}
							className="-mt-10 size-24 shrink-0 ring-[5px] ring-background sm:-mt-12 sm:size-32 sm:ring-[6px]"
							fallbackClassName="bg-muted font-semibold text-3xl text-foreground sm:text-4xl"
						/>
						<div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pb-2">
							<h1 className="break-words font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
								{profileName}
							</h1>
							<p className="mt-1.5 break-all text-muted-foreground text-sm sm:text-base">
								@{displayUsername}
							</p>
						</div>
						<div className="col-start-2 row-start-1 justify-self-end sm:col-start-3 sm:self-center">
							{actionButton}
						</div>
					</div>
				</header>

				<Tabs
					value={activeTab}
					onValueChange={async (value) => {
						await navigate({
							search:
								value === "books"
									? { tab: "books", shelf }
									: value === "audiobooks"
										? { tab: "audiobooks", audiobookShelf }
										: value === "likes"
											? { tab: "likes", likedFormat }
											: {},
							replace: true,
							resetScroll: false,
						});
						// Solo vuelve a las pestañas si quedaron por encima del viewport
						// (p. ej. estabas abajo en el overview). El scroll incondicional
						// es el que provocaba el salto en cada cambio.
						requestAnimationFrame(() => {
							const el = tabsNavRef.current;
							if (el && el.getBoundingClientRect().top < 0) {
								el.scrollIntoView({ block: "start" });
							}
						});
					}}
					className="gap-0"
				>
					<div
						ref={tabsNavRef}
						className="w-full scroll-mt-4 border-border/70 border-b"
					>
						<TabsList
							variant="line"
							className="scrollbar-none w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-12"
						>
							<TabsTrigger
								value="overview"
								className={PROFILE_TAB_TRIGGER_CLASS}
							>
								Overview
							</TabsTrigger>
							<TabsTrigger
								value="books"
								className={PROFILE_TAB_TRIGGER_CLASS}
								onPointerEnter={prefetchBooksTab}
								onFocus={prefetchBooksTab}
							>
								<span className="sm:hidden">Books</span>
								<span className="hidden sm:inline">Book List</span>
							</TabsTrigger>
							<TabsTrigger
								value="audiobooks"
								className={PROFILE_TAB_TRIGGER_CLASS}
								onPointerEnter={prefetchAudiobooksTab}
								onFocus={prefetchAudiobooksTab}
							>
								<span className="sm:hidden">Audiobooks</span>
								<span className="hidden sm:inline">Audiobook List</span>
							</TabsTrigger>
							{/* Only you can see your likes, so nobody else gets the tab. */}
							{isOwnProfile && (
								<TabsTrigger
									value="likes"
									className={PROFILE_TAB_TRIGGER_CLASS}
									onPointerEnter={prefetchLikesTab}
									onFocus={prefetchLikesTab}
								>
									Likes
								</TabsTrigger>
							)}
						</TabsList>
					</div>

					<div className="mt-8 min-h-[50vh] w-full sm:mt-10">
						<main className="min-w-0 flex-1">
							<TabsContent
								value="overview"
								keepMounted
								className="data-[state=active]:animate-none"
							>
								<div className="flex flex-col gap-10">
									<BookShelfSections
										shelves={shelves}
										onViewMore={(status) =>
											navigate({
												search: { tab: "books", shelf: status },
											})
										}
									/>
									<AudiobookShelfSections
										shelves={audiobookShelves}
										onViewMore={(status) =>
											navigate({
												search: {
													tab: "audiobooks",
													audiobookShelf: status,
												},
											})
										}
									/>
									{publicCollectionsSection}
								</div>
							</TabsContent>

							<TabsContent
								value="books"
								keepMounted
								className="data-[state=active]:animate-none"
							>
								<ProfileBooksGrid
									username={username}
									status={shelf}
									onStatusChange={(status) =>
										navigate({
											search: { tab: "books", shelf: status },
											replace: true,
										})
									}
								/>
							</TabsContent>

							<TabsContent
								value="audiobooks"
								keepMounted
								className="data-[state=active]:animate-none"
							>
								<ProfileAudiobooksGrid
									username={username}
									status={audiobookShelf}
									onStatusChange={(status) =>
										navigate({
											search: { tab: "audiobooks", audiobookShelf: status },
											replace: true,
										})
									}
								/>
							</TabsContent>

							{isOwnProfile && (
								<TabsContent
									value="likes"
									keepMounted
									className="data-[state=active]:animate-none"
								>
									<ProfileLikesGrid
										format={likedFormat ?? "books"}
										onFormatChange={(format) =>
											navigate({
												search: { tab: "likes", likedFormat: format },
												replace: true,
											})
										}
									/>
								</TabsContent>
							)}
						</main>
					</div>
				</Tabs>
			</div>
		</div>
	);
}

function ProfileSkeleton() {
	return (
		<div className={cn(PAGE_GUTTER, "pt-4 pb-12 sm:pt-6")}>
			<div className="mx-auto max-w-[1400px]">
				<Skeleton className="h-40 w-full rounded-2xl sm:h-56 lg:h-64" />
				<div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-6 gap-y-5 px-2 pb-8 sm:px-6">
					<Skeleton className="-mt-10 size-24 rounded-full ring-[5px] ring-background sm:-mt-12 sm:size-32 sm:ring-[6px]" />
					<div className="col-span-2 sm:col-span-1 sm:pb-2">
						<Skeleton className="h-10 w-48" />
						<Skeleton className="mt-2 h-5 w-28" />
					</div>
				</div>
				<div className="flex h-12 items-center gap-6 border-border/70 border-b">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-4 w-24" />
				</div>
				<div className="mt-10 space-y-10">
					<SectionSkeleton />
					<SectionSkeleton />
				</div>
			</div>
		</div>
	);
}
