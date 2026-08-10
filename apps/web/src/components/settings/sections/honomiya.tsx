import {
	ArrowsClockwise,
	CircleNotch,
	Cloud,
	Cpu,
	FloppyDisk,
	TerminalWindow,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

type Quality = "accurate" | "fast";

type HonomiyaConfigDraft = {
	enabled: boolean;
	cliPath: string;
	quality: Quality;
	parallelChunks: string;
	retries: string;
	workerConcurrency: string;
};

type ModalCredentialsDraft = {
	tokenId: string;
	tokenSecret: string;
};

const DEFAULT_CONFIG_DRAFT: HonomiyaConfigDraft = {
	enabled: true,
	cliPath: "",
	quality: "accurate",
	parallelChunks: "2",
	retries: "2",
	workerConcurrency: "1",
};

const EMPTY_MODAL_CREDENTIALS: ModalCredentialsDraft = {
	tokenId: "",
	tokenSecret: "",
};

function createConfigDraft(config: {
	enabled: boolean;
	cliPath: string | null;
	quality: Quality;
	parallelChunks: number;
	retries: number;
	workerConcurrency: number;
}): HonomiyaConfigDraft {
	return {
		enabled: config.enabled,
		cliPath: config.cliPath ?? "",
		quality: config.quality,
		parallelChunks: String(config.parallelChunks),
		retries: String(config.retries),
		workerConcurrency: String(config.workerConcurrency),
	};
}

export function HonomiyaSettings() {
	const configQuery = useQuery(orpc.settings.getHonomiya.queryOptions());
	const diagnosticsQuery = useQuery(
		orpc.settings.diagnoseHonomiya.queryOptions(),
	);
	const [configDraft, setConfigDraft] =
		useState<HonomiyaConfigDraft>(DEFAULT_CONFIG_DRAFT);
	const [lastSyncedConfig, setLastSyncedConfig] = useState(configQuery.data);
	const [modalCredentials, setModalCredentials] =
		useState<ModalCredentialsDraft>(EMPTY_MODAL_CREDENTIALS);

	if (configQuery.data !== lastSyncedConfig) {
		setLastSyncedConfig(configQuery.data);
		if (configQuery.data) setConfigDraft(createConfigDraft(configQuery.data));
	}

	const updateMutation = useMutation({
		...orpc.settings.updateHonomiya.mutationOptions(),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: orpc.settings.getHonomiya.queryOptions().queryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.settings.diagnoseHonomiya.queryOptions().queryKey,
				}),
			]);
			toast.success(m["settings.honomiya.saved"]());
		},
		onError: (error) => toast.error(error.message),
	});

	const updateCredentialsMutation = useMutation({
		...orpc.settings.updateHonomiyaModalCredentials.mutationOptions(),
		onSuccess: async () => {
			setModalCredentials(EMPTY_MODAL_CREDENTIALS);
			await queryClient.invalidateQueries({
				queryKey: orpc.settings.diagnoseHonomiya.queryOptions().queryKey,
			});
			toast.success(m["settings.honomiya.credentials_saved"]());
		},
		onError: (error) => toast.error(error.message),
	});

	const removeCredentialsMutation = useMutation({
		...orpc.settings.removeHonomiyaModalCredentials.mutationOptions(),
		onSuccess: async () => {
			setModalCredentials(EMPTY_MODAL_CREDENTIALS);
			await queryClient.invalidateQueries({
				queryKey: orpc.settings.diagnoseHonomiya.queryOptions().queryKey,
			});
			toast.success(m["settings.honomiya.credentials_removed"]());
		},
		onError: (error) => toast.error(error.message),
	});

	const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		updateMutation.mutate({
			enabled: configDraft.enabled,
			cliPath: configDraft.cliPath.trim() || null,
			provider: "modal",
			quality: configDraft.quality,
			parallelChunks: Number(configDraft.parallelChunks),
			retries: Number(configDraft.retries),
			workerConcurrency: Number(configDraft.workerConcurrency),
		});
	};

	const saveModalCredentials = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		updateCredentialsMutation.mutate(modalCredentials);
	};

	const removeModalCredentials = () => {
		if (!window.confirm(m["settings.honomiya.remove_credentials_confirm"]())) {
			return;
		}
		removeCredentialsMutation.mutate({});
	};

	const diagnostics = diagnosticsQuery.data;
	const busy = configQuery.isLoading || updateMutation.isPending;
	const credentialsBusy =
		updateCredentialsMutation.isPending || removeCredentialsMutation.isPending;

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.honomiya.title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.honomiya.description"]()}
					</p>
				</div>

				<div aria-live="polite" aria-busy={diagnosticsQuery.isFetching}>
					<SettingRows>
						<RuntimeRow
							icon={TerminalWindow}
							label={m["settings.honomiya.cli_status"]()}
							description={m["settings.honomiya.cli_status_desc"]()}
							loading={diagnosticsQuery.isLoading}
							available={diagnostics?.cli.available ?? false}
							value={
								diagnostics?.cli.available
									? m["settings.honomiya.cli_available"]({
											version: diagnostics.cli.version ?? "—",
										})
									: m["settings.honomiya.cli_missing"]()
							}
						/>
						<RuntimeRow
							icon={Cloud}
							label={m["settings.honomiya.modal_status"]()}
							description={m["settings.honomiya.modal_status_desc"]()}
							loading={diagnosticsQuery.isLoading}
							available={diagnostics?.modal.configured ?? false}
							value={
								diagnostics?.modal.configured
									? modalCredentialSourceLabel(diagnostics.modal.source)
									: m["settings.honomiya.credentials_missing"]()
							}
						/>
						<RuntimeRow
							icon={Cpu}
							label={m["settings.honomiya.worker_status"]()}
							description={m["settings.honomiya.worker_status_desc"]()}
							loading={diagnosticsQuery.isLoading}
							available={diagnostics?.worker.available ?? false}
							value={
								diagnostics?.worker.available
									? m["settings.honomiya.worker_online"]({
											count: diagnostics.worker.count,
										})
									: m["settings.honomiya.worker_offline"]()
							}
						/>
					</SettingRows>
				</div>

				<Button
					type="button"
					variant="outline"
					size="sm"
					className="self-start"
					disabled={diagnosticsQuery.isFetching}
					onClick={() => diagnosticsQuery.refetch()}
				>
					{diagnosticsQuery.isFetching ? (
						<CircleNotch
							data-icon="inline-start"
							className="animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					) : (
						<ArrowsClockwise data-icon="inline-start" aria-hidden="true" />
					)}
					{m["settings.honomiya.check_configuration"]()}
				</Button>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.honomiya.credentials_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.honomiya.credentials_desc"]()}
					</p>
				</div>

				<form
					className="flex flex-col gap-6"
					onSubmit={saveModalCredentials}
					aria-busy={credentialsBusy}
				>
					<FieldGroup className="grid gap-6 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="honomiya-modal-token-id">
								{m["settings.honomiya.token_id"]()}
							</FieldLabel>
							<Input
								id="honomiya-modal-token-id"
								name="modalTokenId"
								aria-describedby="honomiya-modal-token-id-description"
								autoComplete="off"
								autoCapitalize="none"
								spellCheck={false}
								required
								value={modalCredentials.tokenId}
								disabled={credentialsBusy}
								onChange={(event) =>
									setModalCredentials((current) => ({
										...current,
										tokenId: event.target.value,
									}))
								}
							/>
							<FieldDescription id="honomiya-modal-token-id-description">
								{m["settings.honomiya.token_id_desc"]()}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="honomiya-modal-token-secret">
								{m["settings.honomiya.token_secret"]()}
							</FieldLabel>
							<Input
								id="honomiya-modal-token-secret"
								name="modalTokenSecret"
								aria-describedby="honomiya-modal-token-secret-description"
								type="password"
								autoComplete="new-password"
								autoCapitalize="none"
								spellCheck={false}
								required
								value={modalCredentials.tokenSecret}
								disabled={credentialsBusy}
								onChange={(event) =>
									setModalCredentials((current) => ({
										...current,
										tokenSecret: event.target.value,
									}))
								}
							/>
							<FieldDescription id="honomiya-modal-token-secret-description">
								{m["settings.honomiya.token_secret_desc"]()}
							</FieldDescription>
						</Field>
					</FieldGroup>

					<div className="flex flex-wrap gap-3">
						<Button type="submit" disabled={credentialsBusy}>
							{updateCredentialsMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" aria-hidden="true" />
							)}
							{m["settings.honomiya.save_credentials"]()}
						</Button>
						{diagnostics?.modal.managedConfigured && (
							<Button
								type="button"
								variant="outline"
								disabled={credentialsBusy}
								onClick={removeModalCredentials}
							>
								{removeCredentialsMutation.isPending && (
									<CircleNotch
										data-icon="inline-start"
										className="animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
								)}
								{m["settings.honomiya.remove_credentials"]()}
							</Button>
						)}
					</div>
				</form>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.honomiya.configuration"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.honomiya.configuration_desc"]()}
					</p>
				</div>

				<form className="flex flex-col gap-8" onSubmit={saveSettings}>
					<SettingRows>
						<SettingControlRow
							label={
								<label
									htmlFor="honomiya-enabled"
									className="font-medium text-foreground text-sm"
								>
									{m["settings.honomiya.enabled"]()}
								</label>
							}
							description={
								<span id="honomiya-enabled-description">
									{m["settings.honomiya.enabled_desc"]()}
								</span>
							}
						>
							<Switch
								id="honomiya-enabled"
								aria-describedby="honomiya-enabled-description"
								checked={configDraft.enabled}
								disabled={busy}
								onCheckedChange={(enabled) =>
									setConfigDraft((current) => ({ ...current, enabled }))
								}
							/>
						</SettingControlRow>
						<SettingControlRow
							label={
								<span className="font-medium text-foreground text-sm">
									{m["settings.honomiya.provider"]()}
								</span>
							}
							description={m["settings.honomiya.provider_desc"]()}
						>
							<Badge variant="secondary">Modal</Badge>
						</SettingControlRow>
					</SettingRows>

					<FieldGroup className="grid gap-6 sm:grid-cols-2">
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor="honomiya-cli-path">
								{m["settings.honomiya.cli_path"]()}
							</FieldLabel>
							<Input
								id="honomiya-cli-path"
								aria-describedby="honomiya-cli-path-description"
								value={configDraft.cliPath}
								disabled={busy}
								placeholder={m["settings.honomiya.cli_path_placeholder"]()}
								onChange={(event) =>
									setConfigDraft((current) => ({
										...current,
										cliPath: event.target.value,
									}))
								}
							/>
							<FieldDescription id="honomiya-cli-path-description">
								{m["settings.honomiya.cli_path_desc"]()}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="honomiya-quality">
								{m["settings.honomiya.quality"]()}
							</FieldLabel>
							<Select<Quality>
								value={configDraft.quality}
								disabled={busy}
								onValueChange={(quality) =>
									setConfigDraft((current) => ({ ...current, quality }))
								}
							>
								<SelectTrigger
									id="honomiya-quality"
									aria-describedby="honomiya-quality-description"
									className="w-full"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="accurate">
											{m["settings.honomiya.quality_accurate"]()}
										</SelectItem>
										<SelectItem value="fast">
											{m["settings.honomiya.quality_fast"]()}
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription id="honomiya-quality-description">
								{m["settings.honomiya.quality_desc"]()}
							</FieldDescription>
						</Field>

						<NumberField
							id="honomiya-parallel-chunks"
							label={m["settings.honomiya.parallel_chunks"]()}
							description={m["settings.honomiya.parallel_chunks_desc"]()}
							value={configDraft.parallelChunks}
							min={1}
							max={16}
							disabled={busy}
							onChange={(parallelChunks) =>
								setConfigDraft((current) => ({ ...current, parallelChunks }))
							}
						/>
						<NumberField
							id="honomiya-retries"
							label={m["settings.honomiya.retries"]()}
							description={m["settings.honomiya.retries_desc"]()}
							value={configDraft.retries}
							min={0}
							max={10}
							disabled={busy}
							onChange={(retries) =>
								setConfigDraft((current) => ({ ...current, retries }))
							}
						/>
						<NumberField
							id="honomiya-worker-concurrency"
							label={m["settings.honomiya.worker_concurrency"]()}
							description={m["settings.honomiya.worker_concurrency_desc"]()}
							value={configDraft.workerConcurrency}
							min={1}
							max={8}
							disabled={busy}
							onChange={(workerConcurrency) =>
								setConfigDraft((current) => ({ ...current, workerConcurrency }))
							}
						/>
					</FieldGroup>

					<Button type="submit" className="self-start" disabled={busy}>
						{updateMutation.isPending ? (
							<CircleNotch
								data-icon="inline-start"
								className="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : (
							<FloppyDisk data-icon="inline-start" aria-hidden="true" />
						)}
						{m["settings.honomiya.save"]()}
					</Button>
				</form>
			</section>
		</div>
	);
}

function modalCredentialSourceLabel(
	source: "environment" | "nanahoshi" | "profile" | null,
): string {
	switch (source) {
		case "environment":
			return m["settings.honomiya.credentials_source_environment"]();
		case "nanahoshi":
			return m["settings.honomiya.credentials_source_nanahoshi"]();
		case "profile":
			return m["settings.honomiya.credentials_source_profile"]();
		default:
			return m["settings.honomiya.credentials_missing"]();
	}
}

function RuntimeRow({
	icon: Icon,
	label,
	description,
	loading,
	available,
	value,
}: {
	icon: typeof TerminalWindow;
	label: string;
	description: string;
	loading: boolean;
	available: boolean;
	value: string;
}) {
	return (
		<SettingControlRow
			label={
				<span className="flex items-center gap-2 font-medium text-foreground text-sm">
					<Icon className="size-4.5" aria-hidden="true" />
					{label}
				</span>
			}
			description={description}
		>
			{loading ? (
				<Skeleton className="h-5 w-28" />
			) : (
				<Badge variant={available ? "success" : "warning"}>{value}</Badge>
			)}
		</SettingControlRow>
	);
}

function NumberField({
	id,
	label,
	description,
	value,
	min,
	max,
	disabled,
	onChange,
}: {
	id: string;
	label: string;
	description: string;
	value: string;
	min: number;
	max: number;
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				aria-describedby={`${id}-description`}
				type="number"
				required
				inputMode="numeric"
				min={min}
				max={max}
				step={1}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			/>
			<FieldDescription id={`${id}-description`}>
				{description}
			</FieldDescription>
		</Field>
	);
}
