import {
	AUDIOBOOK_METADATA_FIELDS,
	audiobookMetadataValues,
	BOOK_METADATA_FIELDS,
	bookMetadataValues,
	buildAudiobookMetadataUpdate,
	buildBookMetadataUpdate,
	dirtyKeys,
	dirtyLockKeys,
	type EditableAudiobook,
	type EditableBook,
	lockStateFor,
	type MetadataFieldDef,
	type MetadataLockState,
	type MetadataValues,
	unlockFieldsToSend,
} from "@nanahoshi/api/routers/books/metadata/metadata-edit-form";
import { Button } from "@nanahoshi/ui/components/button";
import { Input } from "@nanahoshi/ui/components/input";
import { Label } from "@nanahoshi/ui/components/label";
import { Modal } from "@nanahoshi/ui/components/modal";
import { Textarea } from "@nanahoshi/ui/components/textarea";
import { CircleNotch, LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client } from "@/utils/orpc";

// Manual edits lock the edited fields server-side so automatic enrichment
// never overwrites them; the padlock next to each field surfaces that state
// and lets the user re-open a field to enrichment. Fields and the update they
// send are shared with the phone app (metadata-edit-form).

const messages = m as unknown as Record<string, () => string>;
const labelFor = (def: MetadataFieldDef) =>
	def.label ?? messages[def.labelKey]();

function FieldRow({
	def,
	value,
	onChange,
	lockState,
	onToggleLock,
	focused,
}: {
	def: MetadataFieldDef;
	value: string;
	onChange: (value: string) => void;
	lockState: MetadataLockState;
	onToggleLock: () => void;
	/** Opened from a specific field (e.g. the tray's "Missing"): land on it. */
	focused?: boolean;
}) {
	const inputId = `edit-meta-${def.key}`;
	const focusedOnceRef = useRef(false);
	// A ref callback, not an effect: the dialog moves focus into the popup on
	// open, so this waits a frame and then takes it.
	const focusRef = (element: HTMLElement | null) => {
		if (!element || !focused || focusedOnceRef.current) return;
		focusedOnceRef.current = true;
		requestAnimationFrame(() => {
			element.focus();
			element.scrollIntoView({ block: "center" });
		});
	};
	const lockIcon =
		lockState === "locked" ? (
			<button
				type="button"
				onClick={onToggleLock}
				title={m["metadata.locked_tooltip"]()}
				aria-label={m["metadata.locked_tooltip"]()}
				className="text-warning transition-colors hover:text-muted-foreground"
			>
				<LockSimple className="size-3.5" weight="fill" />
			</button>
		) : lockState === "pending-unlock" ? (
			<button
				type="button"
				onClick={onToggleLock}
				title={m["metadata.unlock_pending_tooltip"]()}
				aria-label={m["metadata.unlock_pending_tooltip"]()}
				className="text-muted-foreground transition-colors hover:text-warning"
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
					{labelFor(def)}
				</Label>
				{lockIcon}
			</div>
			{def.kind === "textarea" ? (
				<Textarea
					ref={focusRef}
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={4}
				/>
			) : (
				<Input
					ref={focusRef}
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
	focusField,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	focusField?: string;
	fields: MetadataFieldDef[];
	initialValues: MetadataValues;
	lockedFields: string[];
	saving: boolean;
	onSave: (args: { values: MetadataValues; unlockFields: string[] }) => void;
}) {
	const [values, setValues] = useState(initialValues);
	const [pendingUnlocks, setPendingUnlocks] = useState<Set<string>>(new Set());

	const locked = new Set(lockedFields);
	const dirtyLocks = dirtyLockKeys(
		fields,
		dirtyKeys(fields, values, initialValues),
	);
	const hasChanges = dirtyLocks.size > 0 || pendingUnlocks.size > 0;

	const toggleUnlock = (lockKey: string) => {
		setPendingUnlocks((prev) => {
			const next = new Set(prev);
			if (next.has(lockKey)) next.delete(lockKey);
			else next.add(lockKey);
			return next;
		});
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
				onSave({
					values,
					unlockFields: unlockFieldsToSend(pendingUnlocks, dirtyLocks),
				});
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
			<div className="-mr-2 grid max-h-[60dvh] grid-cols-1 gap-4 overflow-y-auto pr-2 sm:grid-cols-2">
				{fields.map((def) => (
					<FieldRow
						key={def.key}
						def={def}
						value={values[def.key] ?? ""}
						onChange={(value) =>
							setValues((prev) => ({ ...prev, [def.key]: value }))
						}
						lockState={lockStateFor(
							def.lockKey,
							locked,
							pendingUnlocks,
							dirtyLocks,
						)}
						onToggleLock={() => toggleUnlock(def.lockKey)}
						focused={def.key === focusField}
					/>
				))}
			</div>
		</Modal>
	);
}

function useSaveMetadata<TArgs>(
	onOpenChange: (open: boolean) => void,
	save: (args: TArgs) => Promise<unknown>,
	onSaved?: () => void,
) {
	const router = useRouter();
	return useMutation({
		mutationFn: save,
		onSuccess: async () => {
			toast.success(m["toast.metadata_saved"]());
			await router.invalidate();
			onSaved?.();
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.metadata_save_failed"]()));
		},
	});
}

// ─── Books ────────────────────────────────────────────────

type BookUpdateArgs = Parameters<typeof client.books.updateMetadata>[0];

export type { EditableBook };

export function EditBookMetadataDialog({
	open,
	onOpenChange,
	book,
	focusField,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	book: EditableBook;
	focusField?: string;
	onSaved?: () => void;
}) {
	const saveMutation = useSaveMetadata(
		onOpenChange,
		(args: BookUpdateArgs) => client.books.updateMetadata(args),
		onSaved,
	);

	return (
		<MetadataFormModal
			open={open}
			onOpenChange={onOpenChange}
			fields={BOOK_METADATA_FIELDS}
			initialValues={bookMetadataValues(book)}
			lockedFields={book.lockedFields ?? []}
			focusField={focusField}
			saving={saveMutation.isPending}
			onSave={({ values, unlockFields }) =>
				saveMutation.mutate(buildBookMetadataUpdate(book, values, unlockFields))
			}
		/>
	);
}

// ─── Audiobooks ───────────────────────────────────────────

type AudiobookUpdateArgs = Parameters<
	typeof client.audiobooks.updateMetadata
>[0];

export type { EditableAudiobook };

export function EditAudiobookMetadataDialog({
	open,
	onOpenChange,
	audiobook,
	focusField,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	audiobook: EditableAudiobook;
	focusField?: string;
	onSaved?: () => void;
}) {
	const saveMutation = useSaveMetadata(
		onOpenChange,
		(args: AudiobookUpdateArgs) => client.audiobooks.updateMetadata(args),
		onSaved,
	);

	return (
		<MetadataFormModal
			open={open}
			onOpenChange={onOpenChange}
			fields={AUDIOBOOK_METADATA_FIELDS}
			initialValues={audiobookMetadataValues(audiobook)}
			lockedFields={audiobook.lockedFields ?? []}
			focusField={focusField}
			saving={saveMutation.isPending}
			onSave={({ values, unlockFields }) =>
				saveMutation.mutate(
					buildAudiobookMetadataUpdate(audiobook, values, unlockFields),
				)
			}
		/>
	);
}
