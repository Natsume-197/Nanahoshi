import { PencilSimple } from "@phosphor-icons/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useRef } from "react";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { SectionSkeleton } from "@/components/dashboard/home/section-skeleton";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsModal } from "@/components/layout/settings-modal-host";
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
import {
	CollectionCard,
	CollectionCardSkeleton,
} from "@/components/shared/collection-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
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
	"h-full flex-1 rounded-lg px-2 py-0 after:inset-x-2 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary data-active:after:opacity-100 sm:px-3";

export const Route = createFileRoute("/dashboard/user/$username/")({
	component: UserProfilePage,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		tab?: "books" | "audiobooks";
		shelf?: ShelfStatus;
		audiobookShelf?: AudiobookShelfStatus;
	} => ({
		tab:
			search.tab === "books" || search.tab === "audiobooks"
				? search.tab
				: undefined,
		shelf: SHELF_STATUS_VALUES.includes(search.shelf as ShelfStatus)
			? (search.shelf as ShelfStatus)
			: undefined,
		audiobookShelf: AUDIOBOOK_SHELF_STATUS_VALUES.includes(
			search.audiobookShelf as AudiobookShelfStatus,
		)
			? (search.audiobookShelf as AudiobookShelfStatus)
			: undefined,
	}),
	loader: ({ params: { username }, context }) => {
		const session = context.session;
		const isOwnProfile =
			(session?.user as { username?: string } | undefined)?.username ===
			username;

		const profileQuery = isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({ input: { username } });

		queryClient.prefetchQuery(profileQuery);
	},
	pendingComponent: ProfileSkeleton,
});

function UserProfilePage() {
	const { username } = useParams({ from: "/dashboard/user/$username/" });
	const { tab, shelf, audiobookShelf } = Route.useSearch();
	const isOverviewTab = tab === undefined;
	const navigate = Route.useNavigate();
	const tabsNavRef = useRef<HTMLDivElement>(null);
	const { openSettings } = useSettingsModal();
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const { session } = Route.useRouteContext();
	const sessionUsername = (session.user as { username?: string }).username;
	const isOwnProfile = !!sessionUsername && sessionUsername === username;

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
				onPointerEnter={preloadSettingsModal}
				onClick={() => openSettings("profile")}
				className="hidden gap-1.5 shadow-sm sm:inline-flex"
			>
				<PencilSimple className="size-4" />
				{m["user_profile.edit_profile"]()}
			</Button>
			<AccountMenu />
		</div>
	) : null;

	const publicCollectionsSection =
		!abilitiesLoading &&
		canReadCollections &&
		(publicCollectionsQuery.isLoading ||
			Boolean(publicCollectionsQuery.data?.length)) ? (
			<section className="flex min-w-0 flex-col gap-3 rounded-xl bg-card/60 p-4 sm:p-5">
				<h2 className="font-semibold text-base">Public Collections</h2>
				{publicCollectionsQuery.isLoading ? (
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,220px))]">
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
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,140px))]">
						{publicCollectionsQuery.data?.map((collection) => (
							<CollectionCard
								key={collection.id}
								id={collection.id}
								name={collection.name}
								previewCovers={collection.previewCovers}
								subtitle={m["media.item_count"]({
									count: collection.bookCount,
								})}
								readOnly
								size="large"
							/>
						))}
					</div>
				)}
			</section>
		) : null;

	return (
		<div className="pb-8">
			<div className="relative aspect-[3/2] w-full bg-muted sm:aspect-[4/1]">
				{headerImageSources ? (
					<img
						{...headerImageSources}
						alt=""
						className="h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out"
						decoding="async"
						onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
						ref={(el) => {
							if (el?.complete) el.classList.remove("opacity-0");
						}}
					/>
				) : (
					<div className="h-full w-full bg-gradient-to-br from-primary/25 via-muted to-chart-5/25" />
				)}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/30 via-black/5 to-transparent" />

				<div className="absolute inset-x-0 bottom-0 z-10">
					<div className="mx-auto flex w-full max-w-[1400px] items-end justify-between gap-3 px-4 pb-3 sm:px-6 sm:pb-4">
						<div className="flex min-w-0 flex-1 items-end gap-3 sm:gap-4">
							<UserAvatar
								name={profileName}
								image={profile?.image}
								className="size-28 shrink-0 drop-shadow-lg sm:size-36 md:size-40"
								fallbackClassName="bg-muted font-bold text-3xl text-foreground sm:text-4xl"
							/>
							<div className="min-w-0 pb-3 sm:pb-4">
								<h1 className="truncate font-bold text-white text-xl leading-tight tracking-tight [text-shadow:0_1px_3px_rgb(0_0_0/0.32)] sm:text-2xl md:text-3xl">
									{profileName}
								</h1>
								<p className="truncate text-base text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.28)] sm:text-lg">
									@{displayUsername}
								</p>
							</div>
						</div>
						<div className="shrink-0 pb-2">{actionButton}</div>
					</div>
				</div>
			</div>

			<Tabs
				value={tab ?? "overview"}
				onValueChange={async (value) => {
					await navigate({
						search:
							value === "books"
								? { tab: "books", shelf }
								: value === "audiobooks"
									? { tab: "audiobooks", audiobookShelf }
									: {},
						replace: true,
						resetScroll: false,
					});
					requestAnimationFrame(() => {
						tabsNavRef.current?.scrollIntoView({ block: "start" });
					});
				}}
				className="gap-0"
			>
				<div
					ref={tabsNavRef}
					className="mx-auto mt-6 w-full max-w-[1400px] scroll-mt-4 px-4 sm:px-6"
				>
					<TabsList
						variant="line"
						className="scrollbar-none h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-card/60 p-1 data-[variant=line]:rounded-xl"
					>
						<TabsTrigger value="overview" className={PROFILE_TAB_TRIGGER_CLASS}>
							Overview
						</TabsTrigger>
						<TabsTrigger value="books" className={PROFILE_TAB_TRIGGER_CLASS}>
							<span className="sm:hidden">Books</span>
							<span className="hidden sm:inline">Book List</span>
						</TabsTrigger>
						<TabsTrigger
							value="audiobooks"
							className={PROFILE_TAB_TRIGGER_CLASS}
						>
							<span className="sm:hidden">Audiobooks</span>
							<span className="hidden sm:inline">Audiobook List</span>
						</TabsTrigger>
					</TabsList>
				</div>

				{/* Body — sidebar + main */}
				<div className="mx-auto mt-6 flex w-full max-w-[1400px] flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:gap-8">
					{isOverviewTab && (
						<aside className="space-y-6 lg:w-[590px] lg:shrink-0">
							{publicCollectionsSection}
						</aside>
					)}

					{/* Main */}
					<main className="min-w-0 flex-1">
						<TabsContent value="overview">
							<div className="flex flex-col gap-8">
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
							</div>
						</TabsContent>

						<TabsContent value="books">
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

						<TabsContent value="audiobooks">
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
					</main>
				</div>
			</Tabs>
		</div>
	);
}

function ProfileSkeleton() {
	return (
		<div className="pb-8">
			{/* Banner with identity overlay */}
			<div className="relative aspect-[3/2] w-full sm:aspect-[4/1]">
				<Skeleton className="h-full w-full rounded-none" />
				<div className="absolute inset-x-0 bottom-0">
					<div className="mx-auto flex w-full max-w-[1400px] items-end gap-3 px-4 pb-3 sm:gap-4 sm:px-6 sm:pb-4">
						<Skeleton className="size-28 shrink-0 rounded-full sm:size-36 md:size-40" />
						<div className="space-y-2 pb-3 sm:pb-4">
							<Skeleton className="h-7 w-40" />
							<Skeleton className="h-5 w-28" />
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto mt-6 w-full max-w-[1400px] px-4 sm:px-6">
				<div className="flex h-10 items-center gap-4 rounded-lg bg-card/60 px-5">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-14" />
				</div>
			</div>

			<div className="mx-auto mt-6 flex w-full max-w-[1400px] flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:gap-8">
				<aside className="space-y-6 lg:w-[590px] lg:shrink-0">
					<div className="space-y-3 rounded-xl bg-card/60 p-4 sm:p-5">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-36" />
					</div>
				</aside>
				<main className="min-w-0 flex-1">
					<div className="space-y-6">
						<Skeleton className="h-40 w-full rounded-lg" />
						<SectionSkeleton />
					</div>
				</main>
			</div>
		</div>
	);
}
