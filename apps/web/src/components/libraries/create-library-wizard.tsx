import { bookMetadataProfile } from "@nanahoshi/api/modules/metadataProfiles";
import { BookOpen, Check, Headphones } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { DirectoryPicker } from "./directory-picker";
import {
	type MetadataDraft,
	MetadataSection,
} from "./library-detail/metadata-section";
import {
	type ScanningDraft,
	ScanningSection,
} from "./library-detail/scanning-section";
import { SCAN_INTERVAL_OPTIONS } from "./library-detail/utils";
import type { MediaType } from "./provider-priority-list";
import { PROVIDER_INFO } from "./provider-priority-list";

export type { MediaType } from "./provider-priority-list";

export interface CreateLibraryData extends MetadataDraft, ScanningDraft {
	name: string;
	mediaType: MediaType;
	paths?: string[];
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
	() => m["library.wizard_step_basics"](),
	() => m["library.wizard_step_folder"](),
	() => m["library.section_metadata"](),
	() => m["library.wizard_step_scanning"](),
	() => m["library.wizard_step_review"](),
] as const;

export function CreateLibraryWizard({
	open,
	onOpenChange,
	onSubmit,
	isPending,
	inline = false,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: CreateLibraryData) => void;
	isPending: boolean;
	inline?: boolean;
}) {
	const [step, setStep] = useState(0);
	const [name, setName] = useState("");
	const [mediaType, setMediaType] = useState<MediaType>("ebook");
	const nextPathId = useRef(1);
	const [paths, setPaths] = useState([{ id: 0, value: "" }]);
	const initialMetadata = useMemo<MetadataDraft>(() => {
		const preset = bookMetadataProfile("general");
		return {
			metadataProviders:
				mediaType === "ebook"
					? {
							...preset,
							order: [...preset.order],
							fields: Object.fromEntries(
								Object.entries(preset.fields ?? {}).map(([field, ids]) => [
									field,
									[...(ids ?? [])],
								]),
							),
						}
					: ["audible", "itunes"],
			metadataConfig: {},
		};
	}, [mediaType]);
	const [metadata, setMetadata] = useState(initialMetadata);
	const [scanning, setScanning] = useState<ScanningDraft>({
		realtimeWatchEnabled: true,
		isCronWatch: false,
		scanIntervalMinutes: null,
	});
	const initialScanning = useRef(scanning).current;
	const metadataLibrary = useMemo(
		() => ({ ...initialMetadata, mediaType }),
		[initialMetadata, mediaType],
	);
	const headingRef = useRef<HTMLHeadingElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Announce and focus each new wizard step.
	useEffect(() => {
		headingRef.current?.focus();
	}, [step]);
	const [showNameError, setShowNameError] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const submit = () => {
		if (!name.trim()) {
			setStep(0);
			setShowNameError(true);
			requestAnimationFrame(() => nameInputRef.current?.focus());
			return;
		}
		if (isPending) return;
		onSubmit({
			name: name.trim(),
			mediaType,
			paths: [
				...new Set(paths.map((path) => path.value.trim()).filter(Boolean)),
			],
			...metadata,
			...scanning,
		});
	};

	const isLastStep = step === STEPS.length - 1;
	const hasFolder = paths.some((path) => path.value.trim().length > 0);
	const goNext = () => {
		if (isPending) return;
		if (!name.trim()) {
			setShowNameError(true);
			nameInputRef.current?.focus();
			return;
		}
		setShowNameError(false);
		setStep(step + 1);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isLastStep) submit();
		else goNext();
	};
	const content = (
		<form onSubmit={handleSubmit} className="space-y-8">
			<header className="space-y-2">
				<h2 className="font-bold text-3xl tracking-tight">
					{inline ? m["home.add_first_library"]() : m["library.new"]()}
				</h2>
				<p className="text-muted-foreground">{m["library.wizard_intro"]()}</p>
			</header>
			<ol className="grid grid-cols-5 gap-2" aria-label={m["library.new"]()}>
				{STEPS.map((label, index) => (
					<li key={label()} aria-current={index === step ? "step" : undefined}>
						<div
							aria-hidden="true"
							className={cn(
								"mb-3 h-1 rounded-full transition-colors",
								index <= step ? "bg-foreground" : "bg-border",
							)}
						/>
						<span
							className={cn(
								"flex items-center gap-1.5 text-xs",
								index === step ? "font-semibold" : "text-muted-foreground",
							)}
						>
							{index < step ? (
								<Check aria-hidden className="size-4 shrink-0" />
							) : (
								<span aria-hidden>{index + 1}</span>
							)}
							<span className="hidden sm:inline">{label()}</span>
						</span>
					</li>
				))}
			</ol>
			<h3
				ref={headingRef}
				tabIndex={-1}
				className="font-semibold text-lg outline-none"
				aria-live="polite"
			>
				{m["library.wizard_step_of"]({
					step: step + 1,
					total: STEPS.length,
					name: STEPS[step]?.() ?? "",
				})}
			</h3>

			<fieldset disabled={isPending} className="min-w-0 space-y-6">
				{step === 0 && (
					<FieldGroup>
						<Field data-invalid={showNameError || undefined}>
							<FieldLabel htmlFor="wizard-library-name">
								{m["library.name"]()}
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
							<FieldLegend variant="label">{m["library.type"]()}</FieldLegend>
							<ToggleGroup
								value={[mediaType]}
								onValueChange={(values) => {
									const next = values[0] as MediaType | undefined;
									if (next) setMediaType(next);
								}}
								variant="outline"
								spacing={2}
								className="grid w-full grid-cols-1 sm:grid-cols-2"
								aria-label={m["library.type"]()}
							>
								{MEDIA_TYPES.map(
									({ value, label, description, icon: Icon }) => (
										<ToggleGroupItem
											key={value}
											value={value}
											className="h-auto min-h-20 items-start justify-start whitespace-normal px-3 py-3 text-left"
										>
											<Icon
												data-icon="inline-start"
												className="mt-0.5"
												aria-hidden
											/>
											<span className="flex flex-col gap-0.5">
												<span className="font-medium">{label()}</span>
												<span className="font-normal text-muted-foreground text-xs">
													{description()}
												</span>
											</span>
										</ToggleGroupItem>
									),
								)}
							</ToggleGroup>
						</FieldSet>
					</FieldGroup>
				)}

				{step === 1 && (
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="wizard-library-folder-0">
								{m["library.source_folder"]()}
							</FieldLabel>
							<FieldDescription>
								{m["library.source_folder_desc"]()}
							</FieldDescription>
							{paths.map((path, index) => (
								<div key={path.id} className="flex items-start gap-2">
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
										onChange={(value) =>
											setPaths((current) =>
												current.map((item, i) =>
													i === index ? { ...item, value } : item,
												),
											)
										}
										inputLabel={m["library.folder_path_number"]({
											number: index + 1,
										})}
									/>
									{paths.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											onClick={() =>
												setPaths((current) =>
													current.filter((_, i) => i !== index),
												)
											}
										>
											{m["library.remove_folder_number"]({ number: index + 1 })}
										</Button>
									)}
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									setPaths((current) => [
										...current,
										{ id: nextPathId.current++, value: "" },
									])
								}
							>
								{m["library.add_folder"]()}
							</Button>
							<FieldDescription>
								{hasFolder
									? m["library.initial_scan_hint"]()
									: m["library.create_empty_hint"]()}
							</FieldDescription>
						</Field>
					</FieldGroup>
				)}

				<div hidden={step !== 2}>
					<MetadataSection
						key={mediaType}
						library={metadataLibrary}
						canManage={!isPending}
						onDraftChange={setMetadata}
					/>
				</div>
				<div hidden={step !== 3}>
					<ScanningSection
						library={initialScanning}
						canManage={!isPending}
						onDraftChange={setScanning}
					/>
				</div>
				{step === 4 && (
					<div className="space-y-6">
						<p className="text-muted-foreground text-sm">
							{m["library.wizard_review_hint"]()}
						</p>
						<dl className="grid gap-5 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{m["library.name"]()}</dt>
								<dd className="mt-1 font-medium">{name}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{m["library.type"]()}</dt>
								<dd className="mt-1 font-medium">
									{MEDIA_TYPES.find(
										(type) => type.value === mediaType,
									)?.label()}
								</dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground">
									{m["library.source_folder"]()}
								</dt>
								<dd className="mt-1 break-all">
									{hasFolder
										? paths
												.map((path) => path.value.trim())
												.filter(Boolean)
												.join(" · ")
										: m["library.create_empty_hint"]()}
								</dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground">
									{m["library.rules_available"]()}
								</dt>
								<dd className="mt-1">
									{(Array.isArray(metadata.metadataProviders)
										? metadata.metadataProviders
										: metadata.metadataProviders.order
									)
										.map((id) => PROVIDER_INFO[id].label)
										.join(" → ")}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									{m["library.realtime_watch"]()}
								</dt>
								<dd className="mt-1">
									{scanning.realtimeWatchEnabled
										? m["library.wizard_enabled"]()
										: m["library.wizard_disabled"]()}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									{m["library.scheduled_scan"]()}
								</dt>
								<dd className="mt-1">
									{scanning.isCronWatch
										? SCAN_INTERVAL_OPTIONS.find(
												(option) =>
													option.value === scanning.scanIntervalMinutes,
											)?.label()
										: m["library.wizard_disabled"]()}
								</dd>
							</div>
						</dl>
						{hasFolder && (
							<p className="text-muted-foreground text-sm">
								{m["library.initial_scan_hint"]()}
							</p>
						)}
					</div>
				)}
			</fieldset>
			<footer className="border-t pt-5">
				<div className="flex w-full flex-wrap items-center justify-between gap-3">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() =>
							step === 0 ? onOpenChange(false) : setStep(step - 1)
						}
						disabled={isPending}
					>
						{step === 0 ? m["common.cancel"]() : m["library.back"]()}
					</Button>
					{isLastStep ? (
						<Button
							type="submit"
							size="sm"
							variant={hasFolder ? "default" : "outline"}
							disabled={isPending}
						>
							{isPending
								? m["library.creating"]()
								: hasFolder
									? m["library.create_and_scan"]()
									: m["library.create_without_folder"]()}
						</Button>
					) : (
						<Button type="submit" size="sm" disabled={isPending}>
							{m["library.next"]()}
						</Button>
					)}
				</div>
			</footer>
		</form>
	);
	if (!open) return null;
	if (inline)
		return (
			<section className="mx-auto w-full max-w-3xl py-6 md:py-10">
				{content}
			</section>
		);
	return (
		<Modal
			open={open}
			onOpenChange={(next) => {
				if (!isPending) onOpenChange(next);
			}}
			title={m["library.new"]()}
			bare
			showCloseButton={!isPending}
			className="sm:max-w-3xl"
		>
			{content}
		</Modal>
	);
}
