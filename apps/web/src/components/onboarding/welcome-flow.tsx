import type { Task } from "@nanahoshi/api/modules/taskManager";
import { Button } from "@nanahoshi/ui/components/button";
import { cn } from "@nanahoshi/ui/lib/utils";
import {
	CircleNotch,
	FolderOpen,
	UploadSimple,
	Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { pickActiveImport } from "@/components/dashboard/home/import-task";
import { DirectoryPicker } from "@/components/libraries/directory-picker";
import { folderFoundText } from "@/components/libraries/folder-preview-hint";
import { LibraryTaskProgress } from "@/components/libraries/library-task-progress";
import {
	UploadBooksModal,
	type UploadTargetLibrary,
} from "@/components/libraries/upload-books-modal";
import { m } from "@/paraglide/messages";
import { getCoverFilename, getCoverUrl } from "@/utils/covers";
import { client, orpc, queryClient } from "@/utils/orpc";
import {
	type FolderCounts,
	type LibraryKind,
	librariesFor,
	welcomeStage,
} from "./onboarding";
import { OnboardingAction, OnboardingShell } from "./onboarding-shell";

// docker-compose mounts the books folder here; most installs need no picking.
const DEFAULT_FOLDER = "/books";

const LIBRARY_NAMES: Record<LibraryKind, () => string> = {
	ebook: () => m["library.type_books"](),
	audiobook: () => m["library.type_audiobooks"](),
};

const refresh = () =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.libraries.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.tasks.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.books.key() }),
	]);

/**
 * Signed in on a server with nothing on it yet: where the books are, the
 * import as it happens, then the library, ready. The step comes from what
 * the server has, so a reload or a later visit lands in the same place.
 */
export function WelcomeFlow() {
	const [uploadTo, setUploadTo] = useState<UploadTargetLibrary[] | null>(null);
	// An import can also start on its own (a file dropped in the folder), so
	// this page keeps an eye out while it's open.
	const tasks = useQuery({
		...orpc.tasks.getActiveTasks.queryOptions(),
		refetchInterval: (query) =>
			pickActiveImport(query.state.data) ? 2000 : 5000,
	});
	const task = pickActiveImport(tasks.data);
	const overview = useQuery({
		...orpc.libraries.getLibrariesOverview.queryOptions(),
		refetchInterval: (query) =>
			task || query.state.data?.every((lib) => lib.bookCount === 0)
				? 4000
				: false,
	});

	const libraries = overview.data ?? [];
	const bookCount = libraries.reduce((sum, lib) => sum + lib.bookCount, 0);
	const covers = libraries.flatMap((lib) => lib.previewCovers);
	const stage =
		overview.isPending || tasks.isPending
			? null
			: welcomeStage({
					libraryCount: libraries.length,
					bookCount,
					importing: !!task,
				});

	return (
		<>
			{uploadTo ? (
				<OnboardingShell
					stepKey="uploading"
					title={m["onboarding.uploading_title"]()}
					lead={m["onboarding.uploading_lead"]()}
				/>
			) : stage === null ? (
				<OnboardingShell stepKey="loading" title={<span className="sr-only" />}>
					<CircleNotch className="mx-auto size-6 animate-spin text-muted-foreground" />
				</OnboardingShell>
			) : stage === "books" ? (
				<BooksStep onUpload={setUploadTo} />
			) : stage === "importing" && task ? (
				<ImportingStep task={task} />
			) : stage === "ready" ? (
				<ReadyStep count={bookCount} covers={covers} />
			) : (
				<EmptyStep onUpload={setUploadTo} />
			)}
			{uploadTo && (
				<UploadBooksModal
					libraries={uploadTo}
					open
					onOpenChange={(open) => {
						if (open) return;
						setUploadTo(null);
						void refresh();
					}}
				/>
			)}
		</>
	);
}

type Choice = "folder" | "upload";

function BooksStep({
	onUpload,
}: {
	onUpload: (libraries: UploadTargetLibrary[]) => void;
}) {
	const [choice, setChoice] = useState<Choice | null>(null);
	const [picked, setPicked] = useState<string | null>(null);
	const [typed, setTyped] = useState<string | null>(null);
	// Look inside once typing pauses, not at every keystroke ("/" alone would
	// walk the whole disk).
	const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
	const onFolderChange = (value: string) => {
		setTyped(value);
		clearTimeout(pause.current);
		pause.current = setTimeout(() => setPicked(value.trim()), 450);
	};
	const suggested = useQuery({
		...orpc.files.previewFolder.queryOptions({
			input: { location: DEFAULT_FOLDER },
		}),
		retry: false,
	});
	const folder =
		picked ?? (suggested.data?.state === "ok" ? DEFAULT_FOLDER : "");
	const preview = useQuery({
		...orpc.files.previewFolder.queryOptions({ input: { location: folder } }),
		enabled: folder.startsWith("/"),
		retry: false,
	});

	const create = useMutation({
		mutationFn: async (kinds: LibraryKind[]) => {
			const created: UploadTargetLibrary[] = [];
			for (const mediaType of kinds) {
				created.push(
					await client.libraries.createLibrary({
						name: LIBRARY_NAMES[mediaType](),
						mediaType,
						paths: [folder],
						realtimeWatchEnabled: true,
						isCronWatch: false,
						scanIntervalMinutes: null,
					}),
				);
			}
			return created;
		},
		onSuccess: async (created) => {
			if (choice === "upload") onUpload(created);
			await refresh();
		},
	});

	const readable = preview.data?.state === "ok";
	const settling = typed !== null && typed.trim() !== folder;
	const blocked =
		!folder && !settling
			? m["onboarding.books_blocked_folder"]()
			: settling || preview.isPending
				? m["onboarding.books_looking"]()
				: !readable
					? m["onboarding.books_blocked_unreadable"]()
					: null;

	if (choice === null)
		return (
			<OnboardingShell
				stepKey="books"
				step={3}
				title={m["onboarding.books_title"]()}
				lead={m["onboarding.books_lead"]()}
			>
				<div className="flex flex-col gap-3">
					<ChoiceRow
						icon={FolderOpen}
						title={m["onboarding.books_folder"]()}
						description={
							suggested.data?.state === "ok"
								? m["onboarding.books_folder_found"]({ folder: DEFAULT_FOLDER })
								: m["onboarding.books_folder_desc"]()
						}
						onClick={() => setChoice("folder")}
					/>
					<ChoiceRow
						icon={UploadSimple}
						title={m["onboarding.books_upload"]()}
						description={m["onboarding.books_upload_desc"]()}
						onClick={() => setChoice("upload")}
					/>
				</div>
			</OnboardingShell>
		);

	const upload = choice === "upload";
	return (
		<OnboardingShell
			stepKey={choice}
			step={3}
			onBack={create.isPending ? undefined : () => setChoice(null)}
			title={
				upload ? m["onboarding.upload_title"]() : m["onboarding.folder_title"]()
			}
			lead={
				upload ? m["onboarding.upload_lead"]() : m["onboarding.folder_lead"]()
			}
			footer={
				<div className="flex flex-col gap-3">
					{create.isError && (
						<p
							role="alert"
							className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm"
						>
							{create.error.message}
						</p>
					)}
					<OnboardingAction
						label={
							create.isPending
								? m["onboarding.books_creating"]()
								: upload
									? m["onboarding.upload_action"]()
									: m["onboarding.folder_action"]()
						}
						blockedReason={blocked}
						pending={create.isPending}
						onClick={() =>
							create.mutate(upload ? ["ebook"] : librariesFor(preview.data))
						}
					/>
				</div>
			}
		>
			<div className="flex flex-col gap-4">
				<DirectoryPicker
					value={typed ?? folder}
					onChange={onFolderChange}
					inputId="onboarding-folder"
					inputLabel={m["onboarding.folder_label"]()}
					placeholder={DEFAULT_FOLDER}
				/>
				{(folder || settling) && (
					<FolderVerdict
						loading={settling || preview.isPending}
						preview={preview.data}
						upload={upload}
					/>
				)}
			</div>
		</OnboardingShell>
	);
}

function ChoiceRow({
	icon: Icon,
	title,
	description,
	onClick,
}: {
	icon: typeof FolderOpen;
	title: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all duration-150 ease-out-quart hover:-translate-y-px hover:border-foreground/25 active:translate-y-0 motion-reduce:transition-none"
		>
			<span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
				<Icon aria-hidden="true" className="size-6" />
			</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium">{title}</span>
				<span className="text-pretty text-muted-foreground text-sm">
					{description}
				</span>
			</span>
		</button>
	);
}

function FolderVerdict({
	loading,
	preview,
	upload,
}: {
	loading: boolean;
	preview: (FolderCounts & { state: string; partial: boolean }) | undefined;
	upload: boolean;
}) {
	if (loading)
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<CircleNotch aria-hidden className="size-4 animate-spin" />
				{m["onboarding.books_looking"]()}
			</p>
		);
	if (preview?.state !== "ok")
		return (
			<p
				role="alert"
				className="flex gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed"
			>
				<Warning aria-hidden className="mt-0.5 size-4 shrink-0" />
				{m["onboarding.folder_unreadable"]()}
			</p>
		);
	const found = folderFoundText(preview);
	return (
		<p className="text-sm" aria-live="polite">
			{found ? (
				<>
					<span className="font-medium">{found}</span>{" "}
					<span className="text-muted-foreground">
						{upload
							? m["onboarding.found_upload_note"]()
							: m["onboarding.found_note"]()}
					</span>
				</>
			) : (
				<span className="text-muted-foreground">
					{upload
						? m["onboarding.empty_folder_upload"]()
						: m["onboarding.empty_folder"]()}
				</span>
			)}
		</p>
	);
}

function ImportingStep({ task }: { task: Task }) {
	const books = useQuery({
		...orpc.books.listRecent.queryOptions({
			input: { limit: 12, compact: true },
		}),
		refetchInterval: 4000,
	});
	const audiobooks = useQuery({
		...orpc.audiobooks.listRecent.queryOptions({
			input: { limit: 12, compact: true },
		}),
		refetchInterval: 4000,
	});
	const covers = [...(books.data ?? []), ...(audiobooks.data ?? [])]
		.map((item) => getCoverFilename(item.cover))
		.filter((cover): cover is string => !!cover)
		.slice(0, 12);

	return (
		<OnboardingShell
			stepKey="importing"
			title={m["onboarding.importing_title"]()}
			lead={m["onboarding.importing_lead"]()}
			footer={
				<Button asChild variant="ghost" className="w-full">
					<Link to="/dashboard">{m["onboarding.importing_leave"]()}</Link>
				</Button>
			}
		>
			<div className="flex flex-col gap-6">
				<LibraryTaskProgress task={task} />
				<div className="grid grid-cols-6 gap-2">
					{Array.from({ length: 12 }, (_, index) => {
						const cover = covers[index];
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed shelf slots
								key={index}
								className="aspect-[2/3] overflow-hidden rounded-md bg-muted"
							>
								{cover && (
									<img
										key={cover}
										src={getCoverUrl(cover, 120)}
										alt=""
										loading="lazy"
										className="fade-in zoom-in-95 size-full animate-in object-cover duration-500 ease-out-quart motion-reduce:animate-none"
									/>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</OnboardingShell>
	);
}

function CoverFan({ covers }: { covers: string[] }) {
	const shown = covers
		.map((cover) => getCoverFilename(cover))
		.filter((cover): cover is string => !!cover)
		.slice(0, 3);
	if (shown.length === 0) return null;
	const tilt = ["-rotate-6 translate-x-6", "z-10", "rotate-6 -translate-x-6"];
	return (
		<div aria-hidden="true" className="flex items-end justify-start ps-2">
			{shown.map((cover, index) => (
				<img
					key={cover}
					src={getCoverUrl(cover, 240)}
					alt=""
					style={{ animationDelay: `${index * 90}ms` }}
					className={cn(
						"fade-in slide-in-from-bottom-4 aspect-[2/3] w-24 animate-in rounded-lg fill-mode-both object-cover shadow-xl ring-1 ring-black/5 duration-700 ease-out-quart motion-reduce:animate-none",
						shown.length > 1 ? tilt[index] : "",
						shown.length === 2 && index === 1 ? "-translate-x-6 rotate-6" : "",
					)}
				/>
			))}
		</div>
	);
}

function ReadyStep({ count, covers }: { count: number; covers: string[] }) {
	return (
		<OnboardingShell
			stepKey="ready"
			visual={<CoverFan covers={covers} />}
			title={m["onboarding.ready_title"]()}
			lead={m["onboarding.ready_lead"]({
				titles: m["onboarding.count_titles"]({ count }),
			})}
			footer={
				<div className="flex flex-col gap-3">
					<Button asChild size="lg" className="h-12 w-full text-base">
						<Link to="/dashboard">{m["onboarding.ready_action"]()}</Link>
					</Button>
					<Button asChild variant="ghost" className="w-full">
						<Link
							to="/dashboard/settings/$section"
							params={{ section: "mobile" }}
						>
							{m["onboarding.ready_phone"]()}
						</Link>
					</Button>
				</div>
			}
		/>
	);
}

function EmptyStep({
	onUpload,
}: {
	onUpload: (libraries: UploadTargetLibrary[]) => void;
}) {
	const libraries = useQuery(orpc.libraries.getUploadTargets.queryOptions());
	const uploadable = libraries.data ?? [];
	return (
		<OnboardingShell
			stepKey="empty"
			title={m["onboarding.empty_title"]()}
			lead={m["onboarding.empty_lead"]()}
			footer={
				<div className="flex flex-col gap-3">
					<OnboardingAction
						label={m["onboarding.empty_upload"]()}
						blockedReason={
							libraries.isPending || uploadable.length > 0
								? null
								: m["onboarding.empty_no_folder"]()
						}
						pending={libraries.isPending}
						onClick={() => onUpload(uploadable)}
					/>
					<Button asChild variant="ghost" className="w-full">
						<Link to="/dashboard">{m["onboarding.importing_leave"]()}</Link>
					</Button>
				</div>
			}
		/>
	);
}
