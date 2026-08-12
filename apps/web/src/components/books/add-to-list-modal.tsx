import {
	BookOpen,
	CircleNotch,
	Globe,
	Lock,
	Plus,
	X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { getShelfOptions } from "@/components/books/shelf-options";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	type MediaType,
	useBookContextMenuActions,
} from "@/hooks/books/use-book-context-menu-actions";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import { orpc } from "@/utils/orpc";

interface AddToListModalProps {
	bookUuid: string;
	mediaType: MediaType;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Header display data. When omitted, it's fetched by uuid on open. */
	title?: string;
	authorName?: string;
	coverPath?: string | null;
}

export function AddToListModal({
	bookUuid,
	mediaType,
	open,
	onOpenChange,
	title,
	authorName,
	coverPath,
}: AddToListModalProps) {
	const isAudiobook = mediaType === "audiobook";
	const {
		collectionsMemberships,
		currentShelfStatus,
		handleCreateCollection,
		handleRemoveShelf,
		handleSetCollectionMembership,
		handleSetShelf,
		isCollectionActionBusy,
		isCollectionsLoading,
		isShelfActionBusy,
		isShelfLoading,
	} = useBookContextMenuActions(bookUuid, mediaType, { enabled: open });

	const { can } = useAbilities();
	const canReadCollections = can("collection", "read");
	const canUpdateCollection = can("collection", "update");
	const canCreateCollection = can("collection", "create");

	// Header data is passed directly from the detail pages; from the context menu
	// (which only knows the uuid) we fetch it lazily when the modal opens.
	const needsFetch = open && !title;
	const bookHeaderQuery = useQuery({
		...orpc.books.getBookWithMetadata.queryOptions({
			input: { uuid: bookUuid },
		}),
		enabled: needsFetch && !isAudiobook,
	});
	const audiobookHeaderQuery = useQuery({
		...orpc.audiobooks.getDetails.queryOptions({ input: { uuid: bookUuid } }),
		enabled: needsFetch && isAudiobook,
	});
	const fetched = isAudiobook
		? audiobookHeaderQuery.data
		: bookHeaderQuery.data;
	const resolvedTitle = title ?? fetched?.title ?? undefined;
	const resolvedAuthor = authorName ?? formatNames(fetched?.authors);
	const resolvedCover = coverPath ?? fetched?.cover ?? null;
	const coverFilename = getCoverFilename(resolvedCover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.thumbnail)
		: null;

	const shelfOptions = getShelfOptions(mediaType);

	const [isCreating, setIsCreating] = useState(false);
	const [newListName, setNewListName] = useState("");

	const resetCreateForm = () => {
		setIsCreating(false);
		setNewListName("");
	};

	const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const created = await handleCreateCollection(newListName, false);
		if (created) resetCreateForm();
	};

	return (
		<Modal
			open={open}
			onOpenChange={(next) => {
				if (!next) resetCreateForm();
				onOpenChange(next);
			}}
			title={resolvedTitle ?? m["add_to_list.title"]()}
			bare
			className="p-4 sm:max-w-lg sm:p-6"
		>
			<div className="flex flex-col gap-5">
				{/* Book header */}
				<div className="flex items-start gap-3 pe-10">
					<div
						className={cn(
							"h-16 w-11 shrink-0 overflow-hidden rounded bg-muted",
							COVER_EDGE,
						)}
					>
						{coverUrl ? (
							<img
								src={coverUrl}
								alt=""
								className="h-full w-full object-cover"
							/>
						) : (
							<div className="grid h-full w-full place-content-center text-muted-foreground">
								<BookOpen aria-hidden="true" />
							</div>
						)}
					</div>
					<div className="min-w-0 flex-1 pt-0.5">
						<p className="text-pretty font-heading font-medium text-base leading-snug [overflow-wrap:anywhere]">
							{resolvedTitle ?? m["add_to_list.title"]()}
						</p>
						{resolvedAuthor ? (
							<p className="truncate text-muted-foreground text-sm">
								{m["add_to_list.by_author"]({ author: resolvedAuthor })}
							</p>
						) : null}
					</div>
				</div>

				{/* Reading-status tiles */}
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{shelfOptions.map((option) => {
						const Icon = option.icon;
						const isActive = currentShelfStatus === option.value;
						return (
							<button
								key={option.value}
								type="button"
								aria-pressed={isActive}
								disabled={isShelfLoading || isShelfActionBusy}
								onClick={() => {
									if (isActive) {
										handleRemoveShelf();
									} else {
										handleSetShelf(option.value);
									}
								}}
								className={cn(
									"relative flex min-h-24 flex-col justify-between gap-2 rounded-2xl border p-3 text-start outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
									isActive
										? "border-border bg-surface-accent text-foreground shadow-sm"
										: "border-transparent bg-surface-card text-muted-foreground hover:bg-surface-card-hover hover:text-foreground",
								)}
							>
								<Icon
									aria-hidden="true"
									className="size-5 self-end"
									weight={isActive ? "fill" : "regular"}
								/>
								<span className="font-medium text-sm leading-tight">
									{option.label()}
								</span>
							</button>
						);
					})}
				</div>

				{/* Custom lists */}
				{canReadCollections ? (
					<div className="flex flex-col gap-1">
						{isCollectionsLoading ? (
							<div className="flex items-center gap-2 px-1 py-3 text-muted-foreground text-sm">
								<CircleNotch className="size-4 animate-spin" />
								{m["common.loading"]()}
							</div>
						) : collectionsMemberships.length > 0 ? (
							collectionsMemberships.map((membership) => (
								<label
									key={membership.id}
									htmlFor={`add-to-list-${membership.id}`}
									className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover"
								>
									<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-card text-muted-foreground">
										{membership.isPublic ? (
											<Globe aria-hidden="true" className="size-5" />
										) : (
											<Lock aria-hidden="true" className="size-5" />
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="line-clamp-2 block break-words font-medium text-sm leading-snug">
											{membership.name}
										</span>
										<span className="block text-muted-foreground text-xs">
											{m["add_to_list.book_count"]({
												count: membership.bookCount,
											})}
										</span>
									</span>
									<Checkbox
										id={`add-to-list-${membership.id}`}
										checked={membership.inCollection}
										disabled={isCollectionActionBusy || !canUpdateCollection}
										onCheckedChange={(checked) => {
											handleSetCollectionMembership(
												membership.id,
												checked === true,
											);
										}}
									/>
								</label>
							))
						) : (
							<p className="px-1 py-2 text-muted-foreground text-sm">
								{m["collection.none"]()}
							</p>
						)}

						{/* Create list */}
						{canCreateCollection ? (
							isCreating ? (
								<form
									onSubmit={(event) => void handleCreateSubmit(event)}
									className="flex flex-col gap-2 px-1 py-2 sm:flex-row sm:items-center"
								>
									<FieldGroup className="gap-2 sm:flex-1">
										<Field className="gap-0">
											<FieldLabel
												htmlFor="new-collection-name"
												className="sr-only"
											>
												{m["collection.name_label"]()}
											</FieldLabel>
											<Input
												id="new-collection-name"
												name="collectionName"
												value={newListName}
												onChange={(event) => setNewListName(event.target.value)}
												placeholder={m["add_to_list.create_placeholder"]()}
												maxLength={80}
												className="min-h-10"
												autoFocus
											/>
										</Field>
									</FieldGroup>
									<div className="flex items-center gap-2 sm:shrink-0">
										<Button
											type="submit"
											size="lg"
											className="min-h-10 flex-1 sm:flex-none"
											disabled={
												isCollectionActionBusy ||
												newListName.trim().length === 0
											}
										>
											{isCollectionActionBusy ? (
												<CircleNotch
													className="animate-spin"
													data-icon="inline-start"
												/>
											) : null}
											{m["common.create"]()}
										</Button>
										<Button
											type="button"
											size="icon-lg"
											variant="ghost"
											onClick={resetCreateForm}
											aria-label={m["common.cancel"]()}
										>
											<X />
										</Button>
									</div>
								</form>
							) : (
								<button
									type="button"
									onClick={() => setIsCreating(true)}
									className="flex items-center gap-3 rounded-xl px-2 py-2 text-start outline-none transition-colors hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/30"
								>
									<span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border border-dashed text-muted-foreground">
										<Plus aria-hidden="true" className="size-5" />
									</span>
									<span className="font-medium text-sm">
										{m["add_to_list.create_list"]()}
									</span>
								</button>
							)
						) : null}
					</div>
				) : null}

				<Button
					type="button"
					className="h-11 w-full rounded-full"
					onClick={() => onOpenChange(false)}
				>
					{m["add_to_list.done"]()}
				</Button>
			</div>
		</Modal>
	);
}
