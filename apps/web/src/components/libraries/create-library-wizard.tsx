import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DirectoryPicker } from "./directory-picker";
import {
	DEFAULT_SCAN_INTERVAL,
	SCAN_INTERVAL_OPTIONS,
} from "./library-detail/utils";
import {
	DEFAULT_PROVIDER_ENTRIES,
	type MetadataProviderId,
	type ProviderEntry,
	ProviderPriorityList,
	toProviderIds,
} from "./provider-priority-list";

interface PathField {
	id: string;
	value: string;
}

export interface CreateLibraryData {
	name: string;
	metadataProviders?: MetadataProviderId[];
	paths?: string[];
	isPublic: boolean;
	isCronWatch: boolean;
	scanIntervalMinutes?: number | null;
}

const STEPS = ["Name & folders", "Options"] as const;

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
	const [paths, setPaths] = useState<PathField[]>([
		{ id: "path-0", value: "" },
	]);
	const [providers, setProviders] = useState<ProviderEntry[]>(
		DEFAULT_PROVIDER_ENTRIES,
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
			metadataProviders: toProviderIds(providers),
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
			title="New library"
			description={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
			className="sm:max-w-lg"
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
						{step === 0 ? "Cancel" : "Back"}
					</Button>
					{isLastStep ? (
						<Button
							size="sm"
							onClick={submit}
							disabled={isPending || !name.trim()}
						>
							{isPending ? "Creating..." : "Create library"}
						</Button>
					) : (
						<Button
							size="sm"
							onClick={() => setStep(step + 1)}
							disabled={!canContinue}
						>
							Next
						</Button>
					)}
				</div>
			}
		>
			<div className="min-h-[220px] py-2">
				{step === 0 && (
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="wizard-library-name">Name</Label>
							<Input
								id="wizard-library-name"
								placeholder="My Library"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Folders (optional)</Label>
							<div className="space-y-2">
								{paths.map((p) => (
									<div key={p.id} className="flex items-center gap-2">
										<DirectoryPicker
											placeholder="/path/to/books"
											value={p.value}
											onChange={(value) => changePath(p.id, value)}
										/>
										{paths.length > 1 && (
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => removePath(p.id)}
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
									Add folder
								</Button>
							</div>
						</div>
					</div>
				)}

				{step === 1 && (
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label>Metadata providers (priority order)</Label>
							<ProviderPriorityList value={providers} onChange={setProviders} />
						</div>

						<div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
							<div>
								<p className="font-medium text-sm">Public library</p>
								<p className="text-muted-foreground text-xs">
									Readable without signing in.
								</p>
							</div>
							<Switch
								checked={isPublic}
								onCheckedChange={setIsPublic}
								aria-label="Toggle public library"
							/>
						</div>

						<div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
							<div>
								<p className="font-medium text-sm">Scheduled scan</p>
								<p className="text-muted-foreground text-xs">
									Rescan automatically on a fixed interval.
								</p>
							</div>
							<Switch
								checked={scheduled}
								onCheckedChange={setScheduled}
								aria-label="Toggle scheduled scan"
							/>
						</div>

						{scheduled && (
							<div className="space-y-1.5">
								<Label>Frequency</Label>
								<Select
									value={String(interval)}
									onValueChange={(v) => setInterval(Number(v))}
								>
									<SelectTrigger className="w-full sm:w-56">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SCAN_INTERVAL_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={String(opt.value)}>
												{opt.label}
											</SelectItem>
										))}
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
