import { BookOpen, Headphones, Info, Plus, X } from "@phosphor-icons/react";
import { type FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { DirectoryPicker } from "./directory-picker";
import {
	type MetadataDraft,
	MetadataSection,
} from "./library-detail/metadata-section";
import type { MediaType } from "./provider-priority-list";
import { PROVIDER_INFO } from "./provider-priority-list";

export type { MediaType } from "./provider-priority-list";

export interface CreateLibraryData extends MetadataDraft {
	name: string;
	mediaType: MediaType;
	paths?: string[];
	realtimeWatchEnabled: boolean;
	isCronWatch: boolean;
	scanIntervalMinutes: number | null;
}

const MEDIA_TYPES: {
	value: MediaType;
	label: () => string;
	description: () => string;
	icon: typeof BookOpen;
}[] = [
	{
		value: "ebook",
		label: () => m["library.type_books"](),
		description: () => m["library.type_books_desc"](),
		icon: BookOpen,
	},
	{
		value: "audiobook",
		label: () => m["library.type_audiobooks"](),
		description: () => m["library.type_audiobooks_desc"](),
		icon: Headphones,
	},
];

const STEPS = [
	() => m["library.wizard_step_folders"](),
	() => m["library.section_metadata"](),
	() => m["library.wizard_step_review"](),
] as const;

export function CreateLibraryWizard({
	onOpenChange,
	onSubmit,
	isPending,
	heading,
}: {
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: CreateLibraryData) => void | Promise<void>;
	isPending: boolean;
	heading?: string;
}) {
	const [step, setStep] = useState(0);
	const [name, setName] = useState("");
	const [mediaType, setMediaType] = useState<MediaType>("ebook");
	const nextPathId = useRef(1);
	const [paths, setPaths] = useState([{ id: 0, value: "" }]);
	const initialMetadata = useMemo<MetadataDraft>(
		() => ({
			metadataProviders:
				mediaType === "ebook"
					? [
							"googlebooks",
							"amazon",
							"openlibrary",
							"hardcover",
							"goodreads",
							"comicvine",
						]
					: ["audible", "itunes"],
			metadataConfig: {},
		}),
		[mediaType],
	);
	const [metadata, setMetadata] = useState(initialMetadata);
	const metadataLibrary = useMemo(
		() => ({ ...initialMetadata, mediaType }),
		[initialMetadata, mediaType],
	);
	const [showNameError, setShowNameError] = useState(false);
	const [showFolderError, setShowFolderError] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const focusFolderInput = () => {
		document.getElementById("wizard-library-folder-0")?.focus();
	};

	const submit = async () => {
		if (!name.trim()) {
			setShowNameError(true);
			setStep(0);
			requestAnimationFrame(() => nameInputRef.current?.focus());
			return;
		}
		if (trimmedPaths.length === 0) {
			setShowFolderError(true);
			setStep(0);
			requestAnimationFrame(focusFolderInput);
			return;
		}
		if (isPending) return;
		setSubmitError(null);
		try {
			await onSubmit({
				name: name.trim(),
				mediaType,
				paths: [
					...new Set(paths.map((path) => path.value.trim()).filter(Boolean)),
				],
				...metadata,
				realtimeWatchEnabled: true,
				isCronWatch: false,
				scanIntervalMinutes: null,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSubmitError(message);
			if (message.includes("Folder is not accessible on the server:"))
				setStep(0);
		}
	};

	const hasMetadataProvider =
		(Array.isArray(metadata.metadataProviders)
			? metadata.metadataProviders
			: metadata.metadataProviders.order
		).length > 0;
	const providerIds: string[] = Array.isArray(metadata.metadataProviders)
		? metadata.metadataProviders
		: metadata.metadataProviders.order;
	const trimmedPaths = paths.map((path) => path.value.trim()).filter(Boolean);
	const hasFolder = trimmedPaths.length > 0;
	const isFolderError = submitError?.includes(
		"Folder is not accessible on the server:",
	);
	const isLastStep = step === STEPS.length - 1;
	const typeLabel =
		MEDIA_TYPES.find((type) => type.value === mediaType)?.label() ?? "";
	const focusHeading = useCallback((element: HTMLHeadingElement | null) => {
		element?.focus();
	}, []);

	const goTo = (next: number) => {
		setStep(next);
	};
	const goNext = () => {
		if (isPending) return;
		if (step === 0) {
			const nameOk = name.trim().length > 0;
			const folderOk = trimmedPaths.length > 0;
			setShowNameError(!nameOk);
			setShowFolderError(!folderOk);
			if (!nameOk) {
				nameInputRef.current?.focus();
				return;
			}
			if (!folderOk) {
				focusFolderInput();
				return;
			}
		}
		setShowNameError(false);
		goTo(step + 1);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isLastStep) void submit();
		else goNext();
	};

	return (
		<section className="w-full py-2 md:py-4">
			<form onSubmit={handleSubmit} className="w-full">
				<header className="flex flex-col gap-1 pb-6">
					<h2 className="text-balance font-semibold text-foreground text-xl">
						{heading ?? m["library.new"]()}
					</h2>
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{m["library.wizard_intro"]()}
					</p>
				</header>

				<div className="flex flex-col gap-2 pb-6">
					<div
						className="flex gap-2"
						role="progressbar"
						aria-valuemin={1}
						aria-valuemax={STEPS.length}
						aria-valuenow={step + 1}
						aria-label={STEPS[step]?.() ?? ""}
					>
						{STEPS.map((label, index) => (
							<span
								key={label()}
								aria-hidden="true"
								className={cn(
									"h-1 flex-1 rounded-full transition-colors",
									index <= step ? "bg-primary" : "bg-muted",
								)}
							/>
						))}
					</div>
					<ol aria-hidden="true" className="flex">
						{STEPS.map((label, index) => (
							<li
								key={label()}
								className={cn(
									"flex-1 text-center text-xs",
									index === step
										? "font-medium text-foreground"
										: "text-muted-foreground",
								)}
							>
								{label()}
							</li>
						))}
					</ol>
				</div>

				<h3
					ref={focusHeading}
					tabIndex={-1}
					aria-live="polite"
					className="pb-6 font-semibold text-foreground text-lg outline-none"
				>
					{m["library.wizard_step"]({ step: step + 1 })}
				</h3>

				<fieldset disabled={isPending} className="min-w-0">
					{step === 0 && (
						<div className="flex flex-col gap-6">
							<div className="grid items-start gap-6 sm:grid-cols-2">
								<Field data-invalid={showNameError || undefined}>
									<FieldLabel htmlFor="wizard-library-name">
										{m["library.name"]()}
										<span aria-hidden="true" className="text-destructive">
											*
										</span>
									</FieldLabel>
									<Input
										ref={nameInputRef}
										id="wizard-library-name"
										placeholder={m["library.name_placeholder"]()}
										value={name}
										onChange={(event) => {
											setName(event.target.value);
											if (event.target.value.trim()) setShowNameError(false);
										}}
										required
										aria-invalid={showNameError || undefined}
										aria-describedby={
											showNameError
												? "wizard-library-name-hint wizard-library-name-error"
												: "wizard-library-name-hint"
										}
										onInvalid={(event) => {
											event.preventDefault();
											setShowNameError(true);
										}}
									/>
									<FieldDescription id="wizard-library-name-hint">
										{m["library.name_hint"]()}
									</FieldDescription>
									{showNameError && (
										<FieldError id="wizard-library-name-error">
											{m["library.name_required"]()}
										</FieldError>
									)}
								</Field>

								<FieldSet>
									<FieldLegend variant="label">
										{m["library.type"]()}
									</FieldLegend>
									<div className="flex flex-col gap-2">
										<ToggleGroup
											value={[mediaType]}
											onValueChange={(values) => {
												const next = values[0] as MediaType | undefined;
												if (next) setMediaType(next);
											}}
											variant="segmented"
											size="lg"
											spacing={1}
											className="grid w-full grid-cols-2"
											aria-label={m["library.type"]()}
										>
											{MEDIA_TYPES.map(({ value, label, icon: Icon }) => (
												<ToggleGroupItem
													key={value}
													value={value}
													className="gap-2"
												>
													<Icon data-icon="inline-start" aria-hidden />
													{label()}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
										<p className="text-muted-foreground text-sm leading-relaxed">
											{m["library.type_hint"]()}
										</p>
									</div>
								</FieldSet>
							</div>
							<Separator className="bg-border/60" />
							<Field data-invalid={showFolderError || undefined}>
								<FieldLabel htmlFor="wizard-library-folder-0">
									{m["library.section_folders"]()}
									<span aria-hidden="true" className="text-destructive">
										*
									</span>
								</FieldLabel>
								<FieldDescription>
									{m["library.source_folder_desc"]()}
								</FieldDescription>
							</Field>
							<div className="flex flex-col gap-2">
								{paths.map((path, index) => (
									<div key={path.id} className="flex items-center gap-2">
										<div className="min-w-0 flex-1">
											<DirectoryPicker
												inputId={
													index === 0 ? "wizard-library-folder-0" : undefined
												}
												placeholder={
													mediaType === "audiobook"
														? m["library.path_audiobooks_placeholder"]()
														: m["library.path_placeholder"]()
												}
												value={path.value}
												onChange={(value) => {
													setSubmitError(null);
													if (value.trim()) setShowFolderError(false);
													setPaths((current) =>
														current.map((item, i) =>
															i === index ? { ...item, value } : item,
														),
													);
												}}
												inputLabel={m["library.folder_path_number"]({
													number: index + 1,
												})}
											/>
										</div>
										{paths.length > 1 && (
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												className="shrink-0 text-muted-foreground"
												onClick={() =>
													setPaths((current) =>
														current.filter((_, i) => i !== index),
													)
												}
												aria-label={m["library.remove_folder_number"]({
													number: index + 1,
												})}
											>
												<X aria-hidden className="size-4" />
											</Button>
										)}
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="self-start border-dashed"
									onClick={() =>
										setPaths((current) => [
											...current,
											{ id: nextPathId.current++, value: "" },
										])
									}
								>
									<Plus data-icon="inline-start" aria-hidden />
									{m["library.add_folder"]()}
								</Button>
							</div>
							{hasFolder && (
								<div className="flex items-start gap-2 text-muted-foreground text-sm leading-relaxed">
									<Info aria-hidden className="mt-0.5 size-4 shrink-0" />
									<p>{m["library.initial_scan_hint"]()}</p>
								</div>
							)}
							{showFolderError && !isFolderError && (
								<FieldError>{m["library.folder_required"]()}</FieldError>
							)}
							{isFolderError && <FieldError>{submitError}</FieldError>}
						</div>
					)}

					<div hidden={step !== 1} className="flex flex-col gap-6">
						<MetadataSection
							key={mediaType}
							library={metadataLibrary}
							canManage={!isPending}
							onDraftChange={setMetadata}
						/>
					</div>

					{step === 2 && (
						<div className="flex flex-col gap-6">
							<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
								{m["library.wizard_review_hint"]()}
							</p>
							<dl className="flex flex-col">
								<div className="flex flex-col gap-1 py-3">
									<dt className="text-muted-foreground text-sm">
										{m["library.name"]()}
									</dt>
									<dd className="font-medium text-sm">{name.trim()}</dd>
								</div>
								<Separator className="bg-border/60" />
								<div className="flex flex-col gap-1 py-3">
									<dt className="text-muted-foreground text-sm">
										{m["library.type"]()}
									</dt>
									<dd className="font-medium text-sm">{typeLabel}</dd>
								</div>
								<Separator className="bg-border/60" />
								<div className="flex flex-col gap-1 py-3">
									<dt className="text-muted-foreground text-sm">
										{m["library.source_folder"]()}
									</dt>
									<dd className="break-all font-medium text-sm">
										{trimmedPaths.join(" · ")}
									</dd>
								</div>
								<Separator className="bg-border/60" />
								<div className="flex flex-col gap-1 py-3">
									<dt className="text-muted-foreground text-sm">
										{m["library.rules_available"]()}
									</dt>
									<dd className="font-medium text-sm">
										{providerIds
											.map(
												(id) =>
													(PROVIDER_INFO as Record<string, { label: string }>)[
														id
													]?.label ?? id,
											)
											.join(" → ")}
									</dd>
								</div>
							</dl>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{m["library.initial_scan_hint"]()}
							</p>
						</div>
					)}
				</fieldset>

				{submitError && !isFolderError && (
					<p className="pt-4 text-destructive text-sm" role="alert">
						{submitError}
					</p>
				)}

				<footer className="flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
					<Button
						type="button"
						variant="ghost"
						onClick={() => (step === 0 ? onOpenChange(false) : goTo(step - 1))}
						disabled={isPending}
					>
						{step === 0 ? m["common.cancel"]() : m["library.back"]()}
					</Button>
					{isLastStep ? (
						<Button
							type="submit"
							size="lg"
							disabled={isPending || !hasMetadataProvider}
							className="sm:min-w-56"
						>
							{isPending
								? m["library.creating"]()
								: m["library.create_and_scan"]()}
						</Button>
					) : (
						<Button type="submit" size="lg" disabled={isPending}>
							{m["library.next"]()}
						</Button>
					)}
				</footer>
			</form>
		</section>
	);
}
