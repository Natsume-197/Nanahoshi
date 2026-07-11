import { CircleNotch, LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client } from "@/utils/orpc";

// Manual edits lock the edited fields server-side so automatic enrichment
// never overwrites them; the padlock next to each field surfaces that state
// and lets the user re-open a field to enrichment.

type FieldKind = "text" | "textarea" | "date" | "number" | "list";

type FieldDef = {
	key: string;
	// Server-side lock name; series name/position share the "series" lock.
	lockKey: string;
	label: string;
	kind: FieldKind;
	mono?: boolean;
	listHint?: boolean;
	fullWidth?: boolean;
};

type LockState = "locked" | "pending-unlock" | "will-lock" | null;

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function joinNames(items: { name: string }[] | null | undefined): string {
	return (items ?? []).map((i) => i.name).join(", ");
}

function textOrNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function FieldRow({
	def,
	value,
	onChange,
	lockState,
	onToggleLock,
}: {
	def: FieldDef;
	value: string;
	onChange: (value: string) => void;
	lockState: LockState;
	onToggleLock: () => void;
}) {
	const inputId = `edit-meta-${def.key}`;
	const lockIcon =
		lockState === "locked" ? (
			<button
				type="button"
				onClick={onToggleLock}
				title={m["metadata.locked_tooltip"]()}
				aria-label={m["metadata.locked_tooltip"]()}
				className="text-amber-500 transition-colors hover:text-muted-foreground dark:text-amber-400"
			>
				<LockSimple className="size-3.5" weight="fill" />
			</button>
		) : lockState === "pending-unlock" ? (
			<button
				type="button"
				onClick={onToggleLock}
				title={m["metadata.unlock_pending_tooltip"]()}
				aria-label={m["metadata.unlock_pending_tooltip"]()}
				className="text-muted-foreground transition-colors hover:text-amber-500"
			>
				<LockSimpleOpen className="size-3.5" />
			</button>
		) : lockState === "will-lock" ? (
			<span
				title={m["metadata.will_lock_tooltip"]()}
				className="text-muted-foreground/60"
			>
				<LockSimple className="size-3.5" />
			</span>
		) : null;

	return (
		<div
			className={
				def.fullWidth ? "space-y-1.5 sm:col-span-2" : "min-w-0 space-y-1.5"
			}
		>
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={inputId} className="text-muted-foreground text-xs">
					{def.label}
				</Label>
				{lockIcon}
			</div>
			{def.kind === "textarea" ? (
				<Textarea
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={4}
				/>
			) : (
				<Input
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					type={
						def.kind === "date"
							? "date"
							: def.kind === "number"
								? "number"
								: "text"
					}
					step={def.kind === "number" ? "any" : undefined}
					className={def.mono ? "font-mono" : undefined}
				/>
			)}
			{def.listHint && (
				<p className="text-muted-foreground/70 text-xs">
					{m["metadata.list_hint"]()}
				</p>
			)}
		</div>
	);
}

function MetadataFormModal({
	open,
	onOpenChange,
	fields,
	initialValues,
	lockedFields,
	saving,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	fields: FieldDef[];
	initialValues: Record<string, string>;
	lockedFields: string[];
	saving: boolean;
	onSave: (args: {
		values: Record<string, string>;
		dirty: (key: string) => boolean;
		unlockFields: string[];
	}) => void;
}) {
	const [values, setValues] = useState(initialValues);
	const [pendingUnlocks, setPendingUnlocks] = useState<Set<string>>(new Set());

	const locked = new Set(lockedFields);
	const dirty = (key: string) => values[key] !== initialValues[key];
	const dirtyLockKeys = new Set(
		fields.filter((f) => dirty(f.key)).map((f) => f.lockKey),
	);
	const hasChanges = dirtyLockKeys.size > 0 || pendingUnlocks.size > 0;

	const toggleUnlock = (lockKey: string) => {
		setPendingUnlocks((prev) => {
			const next = new Set(prev);
			if (next.has(lockKey)) next.delete(lockKey);
			else next.add(lockKey);
			return next;
		});
	};

	const lockStateFor = (lockKey: string): LockState => {
		if (locked.has(lockKey)) {
			return pendingUnlocks.has(lockKey) ? "pending-unlock" : "locked";
		}
		return dirtyLockKeys.has(lockKey) ? "will-lock" : null;
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["book.edit_metadata"]()}
			description={m["metadata.edit_description"]()}
			className="sm:max-w-2xl"
			onSubmit={(e) => {
				e.preventDefault();
				if (!hasChanges || saving) return;
				// A field edited in the same save wins over its pending unlock.
				const unlockFields = [...pendingUnlocks].filter(
					(key) => !dirtyLockKeys.has(key),
				);
				onSave({ values, dirty, unlockFields });
			}}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						{m["common.cancel"]()}
					</Button>
					<Button type="submit" disabled={!hasChanges || saving}>
						{saving && <CircleNotch className="size-4 animate-spin" />}
						{m["common.save"]()}
					</Button>
				</>
			}
		>
			<div className="-mr-2 grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto pr-2 sm:grid-cols-2">
				{fields.map((def) => (
					<FieldRow
						key={def.key}
						def={def}
						value={values[def.key] ?? ""}
						onChange={(value) =>
							setValues((prev) => ({ ...prev, [def.key]: value }))
						}
						lockState={lockStateFor(def.lockKey)}
						onToggleLock={() => toggleUnlock(def.lockKey)}
					/>
				))}
			</div>
		</Modal>
	);
}

function useSaveMetadata<TArgs>(
	onOpenChange: (open: boolean) => void,
	save: (args: TArgs) => Promise<unknown>,
) {
	const router = useRouter();
	return useMutation({
		mutationFn: save,
		onSuccess: async () => {
			toast.success(m["toast.metadata_saved"]());
			await router.invalidate();
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.metadata_save_failed"]()));
		},
	});
}

// ─── Books ────────────────────────────────────────────────

type BookUpdateArgs = Parameters<typeof client.books.updateMetadata>[0];

export type EditableBook = {
	uuid: string;
	title: string | null;
	titleRomaji: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	pageCount: number | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	authors: { name: string; role?: string | null }[];
	publisher: { name: string } | null;
	series: { name: string; position: number | null } | null;
	genres: { name: string }[];
	tags: { name: string }[];
	lockedFields?: string[] | null;
};

export function EditBookMetadataDialog({
	open,
	onOpenChange,
	book,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	book: EditableBook;
}) {
	const saveMutation = useSaveMetadata(onOpenChange, (args: BookUpdateArgs) =>
		client.books.updateMetadata(args),
	);

	const fields: FieldDef[] = [
		{
			key: "title",
			lockKey: "title",
			label: m["book.meta_title"](),
			kind: "text",
			fullWidth: true,
		},
		{
			key: "titleRomaji",
			lockKey: "titleRomaji",
			label: m["metadata.title_romaji"](),
			kind: "text",
		},
		{
			key: "subtitle",
			lockKey: "subtitle",
			label: m["book.meta_subtitle"](),
			kind: "text",
		},
		{
			key: "authors",
			lockKey: "authors",
			label: m["book.authors"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
		{
			key: "description",
			lockKey: "description",
			label: m["book.meta_description"](),
			kind: "textarea",
			fullWidth: true,
		},
		{
			key: "publisher",
			lockKey: "publisher",
			label: m["book.publisher"](),
			kind: "text",
		},
		{
			key: "languageCode",
			lockKey: "languageCode",
			label: m["book.language"](),
			kind: "text",
		},
		{
			key: "seriesName",
			lockKey: "series",
			label: m["book.series"](),
			kind: "text",
		},
		{
			key: "seriesPosition",
			lockKey: "series",
			label: m["book.series_position"](),
			kind: "number",
		},
		{
			key: "publishedDate",
			lockKey: "publishedDate",
			label: m["book.meta_published_date"](),
			kind: "date",
		},
		{
			key: "pageCount",
			lockKey: "pageCount",
			label: m["book.meta_page_count"](),
			kind: "number",
		},
		{
			key: "isbn10",
			lockKey: "isbn10",
			label: "ISBN-10",
			kind: "text",
			mono: true,
		},
		{
			key: "isbn13",
			lockKey: "isbn13",
			label: "ISBN-13",
			kind: "text",
			mono: true,
		},
		{ key: "asin", lockKey: "asin", label: "ASIN", kind: "text", mono: true },
		{
			key: "genres",
			lockKey: "genres",
			label: m["book.genres"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
		{
			key: "tags",
			lockKey: "tags",
			label: m["book.tags"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
	];

	const initialValues: Record<string, string> = {
		title: book.title ?? "",
		titleRomaji: book.titleRomaji ?? "",
		subtitle: book.subtitle ?? "",
		authors: joinNames(book.authors),
		description: book.description ?? "",
		publisher: book.publisher?.name ?? "",
		languageCode: book.languageCode ?? "",
		seriesName: book.series?.name ?? "",
		seriesPosition:
			book.series?.position != null ? String(book.series.position) : "",
		publishedDate: book.publishedDate?.slice(0, 10) ?? "",
		pageCount: book.pageCount != null ? String(book.pageCount) : "",
		isbn10: book.isbn10 ?? "",
		isbn13: book.isbn13 ?? "",
		asin: book.asin ?? "",
		genres: joinNames(book.genres),
		tags: joinNames(book.tags),
	};

	// Existing roles survive a reordered/extended author list.
	const roleByName = new Map(book.authors.map((a) => [a.name, a.role ?? null]));

	return (
		<MetadataFormModal
			open={open}
			onOpenChange={onOpenChange}
			fields={fields}
			initialValues={initialValues}
			lockedFields={book.lockedFields ?? []}
			saving={saveMutation.isPending}
			onSave={({ values, dirty, unlockFields }) => {
				const metadata: BookUpdateArgs["metadata"] = {};
				if (dirty("title")) metadata.title = textOrNull(values.title);
				if (dirty("titleRomaji"))
					metadata.titleRomaji = textOrNull(values.titleRomaji);
				if (dirty("subtitle")) metadata.subtitle = textOrNull(values.subtitle);
				if (dirty("description"))
					metadata.description = textOrNull(values.description);
				if (dirty("publisher"))
					metadata.publisher = textOrNull(values.publisher);
				if (dirty("languageCode"))
					metadata.languageCode = textOrNull(values.languageCode);
				if (dirty("publishedDate"))
					metadata.publishedDate = textOrNull(values.publishedDate);
				if (dirty("pageCount")) {
					const n = Number.parseInt(values.pageCount, 10);
					metadata.pageCount = Number.isFinite(n) && n > 0 ? n : null;
				}
				if (dirty("isbn10")) metadata.isbn10 = textOrNull(values.isbn10);
				if (dirty("isbn13")) metadata.isbn13 = textOrNull(values.isbn13);
				if (dirty("asin")) metadata.asin = textOrNull(values.asin);
				if (dirty("authors")) {
					metadata.authors = splitList(values.authors).map((name) => ({
						name,
						role: roleByName.get(name) ?? null,
					}));
				}
				if (dirty("seriesName") || dirty("seriesPosition")) {
					const name = values.seriesName.trim();
					const position = Number.parseFloat(values.seriesPosition);
					metadata.series = name
						? { name, position: Number.isFinite(position) ? position : null }
						: null;
				}
				if (dirty("genres")) metadata.genres = splitList(values.genres);
				if (dirty("tags")) metadata.tags = splitList(values.tags);

				saveMutation.mutate({
					uuid: book.uuid,
					metadata,
					unlockFields: unlockFields as BookUpdateArgs["unlockFields"],
				});
			}}
		/>
	);
}

// ─── Audiobooks ───────────────────────────────────────────

type AudiobookUpdateArgs = Parameters<
	typeof client.audiobooks.updateMetadata
>[0];

export type EditableAudiobook = {
	uuid: string;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	isbn: string | null;
	asin: string | null;
	authors: { name: string; role?: string | null }[];
	narrators: { name: string }[];
	publisherName: string | null;
	series: { name: string; position: number | null } | null;
	genres: { name: string }[];
	tags: { name: string }[];
	lockedFields?: string[] | null;
};

export function EditAudiobookMetadataDialog({
	open,
	onOpenChange,
	audiobook,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	audiobook: EditableAudiobook;
}) {
	const saveMutation = useSaveMetadata(
		onOpenChange,
		(args: AudiobookUpdateArgs) => client.audiobooks.updateMetadata(args),
	);

	const fields: FieldDef[] = [
		{
			key: "title",
			lockKey: "title",
			label: m["book.meta_title"](),
			kind: "text",
			fullWidth: true,
		},
		{
			key: "subtitle",
			lockKey: "subtitle",
			label: m["book.meta_subtitle"](),
			kind: "text",
			fullWidth: true,
		},
		{
			key: "authors",
			lockKey: "authors",
			label: m["audiobook.authors"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
		{
			key: "narrators",
			lockKey: "narrators",
			label: m["audiobook.narrators"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
		{
			key: "description",
			lockKey: "description",
			label: m["book.meta_description"](),
			kind: "textarea",
			fullWidth: true,
		},
		{
			key: "publisher",
			lockKey: "publisher",
			label: m["book.publisher"](),
			kind: "text",
		},
		{
			key: "languageCode",
			lockKey: "languageCode",
			label: m["audiobook.language"](),
			kind: "text",
		},
		{
			key: "seriesName",
			lockKey: "series",
			label: m["audiobook.series"](),
			kind: "text",
		},
		{
			key: "seriesPosition",
			lockKey: "series",
			label: m["audiobook.series_position"](),
			kind: "number",
		},
		{
			key: "publishedDate",
			lockKey: "publishedDate",
			label: m["book.meta_published_date"](),
			kind: "date",
		},
		{ key: "isbn", lockKey: "isbn", label: "ISBN", kind: "text", mono: true },
		{ key: "asin", lockKey: "asin", label: "ASIN", kind: "text", mono: true },
		{
			key: "genres",
			lockKey: "genres",
			label: m["book.genres"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
		{
			key: "tags",
			lockKey: "tags",
			label: m["book.tags"](),
			kind: "list",
			listHint: true,
			fullWidth: true,
		},
	];

	const initialValues: Record<string, string> = {
		title: audiobook.title ?? "",
		subtitle: audiobook.subtitle ?? "",
		authors: joinNames(audiobook.authors),
		narrators: joinNames(audiobook.narrators),
		description: audiobook.description ?? "",
		publisher: audiobook.publisherName ?? "",
		languageCode: audiobook.languageCode ?? "",
		seriesName: audiobook.series?.name ?? "",
		seriesPosition:
			audiobook.series?.position != null
				? String(audiobook.series.position)
				: "",
		publishedDate: audiobook.publishedDate?.slice(0, 10) ?? "",
		isbn: audiobook.isbn ?? "",
		asin: audiobook.asin ?? "",
		genres: joinNames(audiobook.genres),
		tags: joinNames(audiobook.tags),
	};

	const roleByName = new Map(
		audiobook.authors.map((a) => [a.name, a.role ?? null]),
	);

	return (
		<MetadataFormModal
			open={open}
			onOpenChange={onOpenChange}
			fields={fields}
			initialValues={initialValues}
			lockedFields={audiobook.lockedFields ?? []}
			saving={saveMutation.isPending}
			onSave={({ values, dirty, unlockFields }) => {
				const metadata: AudiobookUpdateArgs["metadata"] = {};
				if (dirty("title")) metadata.title = textOrNull(values.title);
				if (dirty("subtitle")) metadata.subtitle = textOrNull(values.subtitle);
				if (dirty("description"))
					metadata.description = textOrNull(values.description);
				if (dirty("publisher"))
					metadata.publisher = textOrNull(values.publisher);
				if (dirty("languageCode"))
					metadata.languageCode = textOrNull(values.languageCode);
				if (dirty("publishedDate"))
					metadata.publishedDate = textOrNull(values.publishedDate);
				if (dirty("isbn")) metadata.isbn = textOrNull(values.isbn);
				if (dirty("asin")) metadata.asin = textOrNull(values.asin);
				if (dirty("authors")) {
					metadata.authors = splitList(values.authors).map((name) => ({
						name,
						role: roleByName.get(name) ?? null,
					}));
				}
				if (dirty("narrators")) {
					metadata.narrators = splitList(values.narrators).map((name) => ({
						name,
					}));
				}
				if (dirty("seriesName") || dirty("seriesPosition")) {
					const name = values.seriesName.trim();
					const position = Number.parseFloat(values.seriesPosition);
					metadata.series = name
						? { name, position: Number.isFinite(position) ? position : null }
						: null;
				}
				if (dirty("genres")) metadata.genres = splitList(values.genres);
				if (dirty("tags")) metadata.tags = splitList(values.tags);

				saveMutation.mutate({
					uuid: audiobook.uuid,
					metadata,
					unlockFields: unlockFields as AudiobookUpdateArgs["unlockFields"],
				});
			}}
		/>
	);
}
