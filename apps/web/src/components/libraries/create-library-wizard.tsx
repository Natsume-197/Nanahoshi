import { BookOpen, Headphones } from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
import { m } from "@/paraglide/messages";
import { DirectoryPicker } from "./directory-picker";
import type { MediaType } from "./provider-priority-list";

export type { MediaType } from "./provider-priority-list";

export interface CreateLibraryData {
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
] as const;

export function CreateLibraryWizard({
	open,
	onOpenChange,
	onSubmit,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: CreateLibraryData) => void;
	isPending: boolean;
}) {
	const [step, setStep] = useState(0);
	const [name, setName] = useState("");
	const [mediaType, setMediaType] = useState<MediaType>("ebook");
	const [path, setPath] = useState("");
	const [showNameError, setShowNameError] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const submit = () => {
		if (!name.trim()) {
			setStep(0);
			setShowNameError(true);
			requestAnimationFrame(() => nameInputRef.current?.focus());
			return;
		}
		const trimmedPath = path.trim();
		onSubmit({
			name: name.trim(),
			mediaType,
			paths: trimmedPath ? [trimmedPath] : undefined,
		});
	};

	const isLastStep = step === STEPS.length - 1;
	const hasFolder = path.trim().length > 0;
	const goToFolderStep = () => {
		if (!name.trim()) {
			setShowNameError(true);
			nameInputRef.current?.focus();
			return;
		}
		setShowNameError(false);
		setStep(1);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["library.new"]()}
			description={m["library.wizard_step_of"]({
				step: step + 1,
				total: STEPS.length,
				name: STEPS[step]?.() ?? "",
			})}
			className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
			onSubmit={(event) => {
				event.preventDefault();
				if (isLastStep) submit();
				else goToFolderStep();
			}}
			footer={
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
						<Button type="submit" size="sm">
							{m["library.next"]()}
						</Button>
					)}
				</div>
			}
		>
			<div className="max-h-[min(62dvh,560px)] min-h-[240px] overflow-y-auto py-2 pr-1">
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
								autoFocus
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
							<FieldLabel htmlFor="wizard-library-folder">
								{m["library.source_folder"]()}
							</FieldLabel>
							<FieldDescription>
								{m["library.source_folder_desc"]()}
							</FieldDescription>
							<DirectoryPicker
								inputId="wizard-library-folder"
								placeholder={
									mediaType === "audiobook"
										? m["library.path_audiobooks_placeholder"]()
										: m["library.path_placeholder"]()
								}
								value={path}
								onChange={setPath}
								inputLabel={m["library.folder_path_label"]()}
								autoFocus
							/>
							<FieldDescription>
								{hasFolder
									? m["library.initial_scan_hint"]()
									: m["library.create_empty_hint"]()}
							</FieldDescription>
						</Field>
					</FieldGroup>
				)}
			</div>
		</Modal>
	);
}
