import { BookOpen, Headphones, Plus, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION } from "@/lib/audible-regions";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { DirectoryPicker } from "./directory-picker";
import {
	DEFAULT_SCAN_INTERVAL,
	SCAN_INTERVAL_OPTIONS,
} from "./library-detail/utils";
import {
	defaultProviderEntries,
	type MediaType,
	type MetadataProviderId,
	type ProviderEntry,
	ProviderPriorityList,
	toProviderIds,
} from "./provider-priority-list";

interface PathField {
	id: string;
	value: string;
}

export type { MediaType } from "./provider-priority-list";

export interface CreateLibraryData {
	name: string;
	mediaType: MediaType;
	metadataProviders?: MetadataProviderId[];
	metadataConfig?: { audible?: { region?: string } };
	paths?: string[];
	isPublic: boolean;
	isCronWatch: boolean;
	scanIntervalMinutes?: number | null;
}

const MEDIA_TYPES: {
	value: MediaType;
	label: () => string;
	icon: typeof BookOpen;
}[] = [
	{ value: "ebook", label: () => m["library.type_books"](), icon: BookOpen },
	{
		value: "audiobook",
		label: () => m["library.type_audiobooks"](),
		icon: Headphones,
	},
];

const STEPS = [
	() => m["library.wizard_step_folders"](),
	() => m["library.wizard_step_options"](),
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
	const [paths, setPaths] = useState<PathField[]>([
		{ id: "path-0", value: "" },
	]);
	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		defaultProviderEntries("ebook"),
	);
	const [audibleRegion, setAudibleRegion] = useState<string>(
		DEFAULT_AUDIBLE_REGION,
	);
	const [isPublic, setIsPublic] = useState(false);
	const [scheduled, setScheduled] = useState(false);
	const [interval, setInterval] = useState(DEFAULT_SCAN_INTERVAL);
	const nextPathIdRef = useRef(1);

	const addPath = () => {
		const id = `path-${nextPathIdRef.current}`;
		nextPathIdRef.current += 1;
		setPaths((prev) => [...prev, { id, value: "" }]);
	};
	const removePath = (id: string) =>
		setPaths((prev) => prev.filter((p) => p.id !== id));
	const changePath = (id: string, value: string) =>
		setPaths((prev) => prev.map((p) => (p.id === id ? { ...p, value } : p)));

	const submit = () => {
		const validPaths = paths
			.map((p) => p.value.trim())
			.filter((p) => p.length > 0);
		onSubmit({
			name: name.trim(),
			mediaType,
			metadataProviders: toProviderIds(providers),
			metadataConfig:
				mediaType === "audiobook"
					? { audible: { region: audibleRegion } }
					: undefined,
			paths: validPaths.length > 0 ? validPaths : undefined,
			isPublic,
			isCronWatch: scheduled,
			scanIntervalMinutes: scheduled ? interval : null,
		});
	};

	const canContinue = step !== 0 || name.trim().length > 0;
	const isLastStep = step === STEPS.length - 1;

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
			footer={
				<div className="flex w-full items-center justify-between">
					<Button
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
							size="sm"
							onClick={submit}
							disabled={isPending || !name.trim()}
						>
							{isPending
								? m["library.creating"]()
								: m["library.create_library"]()}
						</Button>
					) : (
						<Button
							size="sm"
							onClick={() => setStep(step + 1)}
							disabled={!canContinue}
						>
							{m["library.next"]()}
						</Button>
					)}
				</div>
			}
		>
			<div className="max-h-[min(62dvh,560px)] min-h-[220px] overflow-y-auto py-2 pr-1">
				{step === 0 && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wizard-library-name">{m["library.name"]()}</Label>
							<Input
								id="wizard-library-name"
								placeholder={m["library.name_placeholder"]()}
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
							/>
						</div>
						<fieldset className="flex flex-col gap-1.5">
							<legend className="font-medium text-sm">
								{m["library.type"]()}
							</legend>
							<div className="grid grid-cols-2 gap-2">
								{MEDIA_TYPES.map(({ value, label, icon: Icon }) => {
									const active = mediaType === value;
									return (
										<button
											key={value}
											type="button"
											onClick={() => {
												setMediaType(value);
												setProviders(defaultProviderEntries(value));
											}}
											aria-pressed={active}
											className={cn(
												"flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
												active
													? "border-foreground/30 bg-accent/60 font-medium"
													: "border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/40",
											)}
										>
											<Icon className="size-4 shrink-0" />
											{label()}
										</button>
									);
								})}
							</div>
						</fieldset>
						<fieldset className="flex flex-col gap-1.5">
							<legend className="font-medium text-sm">
								{m["library.folders_optional"]()}
							</legend>
							<div className="flex flex-col gap-2">
								{paths.map((p, index) => (
									<div key={p.id} className="flex items-center gap-2">
										<DirectoryPicker
											placeholder={m["library.path_placeholder"]()}
											value={p.value}
											onChange={(value) => changePath(p.id, value)}
											inputLabel={m["library.folder_path_number"]({
												number: index + 1,
											})}
										/>
										{paths.length > 1 && (
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => removePath(p.id)}
												aria-label={m["library.remove_folder_number"]({
													number: index + 1,
												})}
											>
												<X className="size-4" />
											</Button>
										)}
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addPath}
								>
									<Plus className="mr-1.5 size-4" />
									{m["library.add_folder"]()}
								</Button>
							</div>
						</fieldset>
					</div>
				)}

				{step === 1 && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label>{m["library.providers_priority"]()}</Label>
							<ProviderPriorityList value={providers} onChange={setProviders} />
						</div>

						{mediaType === "audiobook" && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="wizard-audible-region">
									{m["library.audible_region"]()}
								</Label>
								<Select
									items={AUDIBLE_REGIONS}
									value={audibleRegion}
									onValueChange={setAudibleRegion}
								>
									<SelectTrigger
										id="wizard-audible-region"
										className="w-full sm:w-56"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{AUDIBLE_REGIONS.map((r) => (
												<SelectItem key={r.value} value={r.value}>
													{r.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									{m["library.audible_region_hint"]()}
								</p>
							</div>
						)}

						<div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
							<div>
								<p className="font-medium text-sm">
									{m["library.public_title"]()}
								</p>
								<p className="text-muted-foreground text-xs">
									{m["library.public_desc"]()}
								</p>
							</div>
							<Switch
								checked={isPublic}
								onCheckedChange={setIsPublic}
								aria-label={m["library.toggle_public"]()}
							/>
						</div>

						<div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
							<div>
								<p className="font-medium text-sm">
									{m["library.scheduled_scan"]()}
								</p>
								<p className="text-muted-foreground text-xs">
									{m["library.scheduled_desc"]()}
								</p>
							</div>
							<Switch
								checked={scheduled}
								onCheckedChange={setScheduled}
								aria-label={m["library.toggle_scheduled"]()}
							/>
						</div>

						{scheduled && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="wizard-scan-frequency">
									{m["library.frequency"]()}
								</Label>
								<Select
									items={SCAN_INTERVAL_OPTIONS.map((option) => ({
										value: String(option.value),
										label: option.label(),
									}))}
									value={String(interval)}
									onValueChange={(v) => setInterval(Number(v))}
								>
									<SelectTrigger
										id="wizard-scan-frequency"
										className="w-full sm:w-56"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{SCAN_INTERVAL_OPTIONS.map((opt) => (
												<SelectItem key={opt.value} value={String(opt.value)}>
													{opt.label()}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
}
