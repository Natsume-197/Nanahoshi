import { Badge } from "@nanahoshi/ui/components/badge";
import { Button } from "@nanahoshi/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@nanahoshi/ui/components/field";
import { Input } from "@nanahoshi/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nanahoshi/ui/components/select";
import { Skeleton } from "@nanahoshi/ui/components/skeleton";
import { Switch } from "@nanahoshi/ui/components/switch";
import {
	ArrowSquareOut,
	ArrowsClockwise,
	CircleNotch,
	Cloud,
	Cpu,
	DownloadSimple,
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
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

type Quality = "accurate" | "fast";
type Provider = "local" | "modal";
type Engine = "auto" | "ctc" | "whisper";

const MODEL_POLL_MS = 2_000;

type HonomiyaConfigDraft = {
	enabled: boolean;
	cliPath: string;
	engine: Engine;
	provider: Provider;
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
	engine: "auto",
	provider: "modal",
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
	engine: Engine;
	provider: Provider;
	quality: Quality;
	parallelChunks: number;
	retries: number;
	workerConcurrency: number;
}): HonomiyaConfigDraft {
	return {
		enabled: config.enabled,
		cliPath: config.cliPath ?? "",
		engine: config.engine,
		provider: config.provider,
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
	const modelsQuery = useQuery({
		...orpc.settings.honomiyaModels.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.some((model) => model.pulling) ? MODEL_POLL_MS : false,
	});
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

	const pullModelMutation = useMutation({
		...orpc.settings.pullHonomiyaModel.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.settings.honomiyaModels.queryOptions().queryKey,
			});
			toast.success(m["settings.honomiya.model_download_started"]());
		},
		onError: (error) => toast.error(error.message),
	});

	const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		updateMutation.mutate({
			enabled: configDraft.enabled,
			cliPath: configDraft.cliPath.trim() || null,
			engine: configDraft.engine,
			provider: configDraft.provider,
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
	const usesWhisper = configDraft.engine !== "ctc";
	const usesModal = usesWhisper && configDraft.provider === "modal";
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
						{usesModal && (
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
						)}
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
						{m["settings.honomiya.models_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.honomiya.models_desc"]()}
					</p>
				</div>
				{modelsQuery.isLoading ? (
					<Skeleton className="h-32 w-full" />
				) : modelsQuery.data?.length ? (
					<SettingRows>
						{modelsQuery.data.map((model) => (
							<ModelRow
								key={model.id}
								model={model}
								starting={
									pullModelMutation.isPending &&
									pullModelMutation.variables?.model === model.id
								}
								onDownload={() => pullModelMutation.mutate({ model: model.id })}
							/>
						))}
					</SettingRows>
				) : (
					<p className="text-muted-foreground text-sm">
						{m["settings.honomiya.models_unavailable"]()}
					</p>
				)}
			</section>

			{usesModal && (
				<section className="flex flex-col gap-6">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["settings.honomiya.credentials_title"]()}
						</h2>
						<p className="max-w-2xl text-muted-foreground text-sm">
							{m["settings.honomiya.credentials_desc"]()}
						</p>
					</div>

					<Button asChild variant="outline" className="self-start">
						<a
							href="https://modal.com/settings/tokens"
							target="_blank"
							rel="noreferrer"
						>
							<ArrowSquareOut data-icon="inline-start" aria-hidden="true" />
							{m["settings.honomiya.open_modal_tokens"]()}
						</a>
					</Button>

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
			)}

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
								<label
									htmlFor="honomiya-engine"
									className="font-medium text-foreground text-sm"
								>
									{m["settings.honomiya.engine"]()}
								</label>
							}
							description={
								<span id="honomiya-engine-description">
									{m["settings.honomiya.engine_desc"]()}
								</span>
							}
						>
							<Select<Engine>
								items={[
									{
										value: "auto",
										label: m["settings.honomiya.engine_auto"](),
									},
									{ value: "ctc", label: m["settings.honomiya.engine_ctc"]() },
									{
										value: "whisper",
										label: m["settings.honomiya.engine_whisper"](),
									},
								]}
								value={configDraft.engine}
								disabled={busy}
								onValueChange={(engine) =>
									setConfigDraft((current) => ({ ...current, engine }))
								}
							>
								<SelectTrigger
									id="honomiya-engine"
									aria-describedby="honomiya-engine-description"
									className="w-44"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="auto">
											{m["settings.honomiya.engine_auto"]()}
										</SelectItem>
										<SelectItem value="ctc">
											{m["settings.honomiya.engine_ctc"]()}
										</SelectItem>
										<SelectItem value="whisper">
											{m["settings.honomiya.engine_whisper"]()}
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</SettingControlRow>
						{usesWhisper && (
							<SettingControlRow
								label={
									<label
										htmlFor="honomiya-provider"
										className="font-medium text-foreground text-sm"
									>
										{m["settings.honomiya.provider"]()}
									</label>
								}
								description={
									<span id="honomiya-provider-description">
										{m["settings.honomiya.provider_desc"]()}
									</span>
								}
							>
								<Select<Provider>
									items={[
										{
											value: "local",
											label: m["settings.honomiya.provider_local"](),
										},
										{
											value: "modal",
											label: m["settings.honomiya.provider_modal"](),
										},
									]}
									value={configDraft.provider}
									disabled={busy}
									onValueChange={(provider) =>
										setConfigDraft((current) => ({ ...current, provider }))
									}
								>
									<SelectTrigger
										id="honomiya-provider"
										aria-describedby="honomiya-provider-description"
										className="w-44"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="local">
												{m["settings.honomiya.provider_local"]()}
											</SelectItem>
											<SelectItem value="modal">
												{m["settings.honomiya.provider_modal"]()}
											</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</SettingControlRow>
						)}
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

						{usesWhisper && (
							<Field>
								<FieldLabel htmlFor="honomiya-quality">
									{m["settings.honomiya.quality"]()}
								</FieldLabel>
								<Select<Quality>
									items={[
										{
											value: "accurate",
											label: m["settings.honomiya.quality_accurate"](),
										},
										{
											value: "fast",
											label: m["settings.honomiya.quality_fast"](),
										},
									]}
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
						)}
						{usesWhisper && (
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
						)}
						{usesWhisper && (
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
						)}
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

type ModelStatus = {
	id: string;
	languages: string[];
	sizeMiB: number;
	installed: boolean;
	pulling: boolean;
	error: string | null;
};

function modelLanguageLabel(languages: string[]): string {
	return languages
		.map((language) => {
			switch (language) {
				case "ja":
					return m["settings.honomiya.model_language_ja"]();
				case "es":
					return m["settings.honomiya.model_language_es"]();
				case "en":
					return m["settings.honomiya.model_language_en"]();
				default:
					return language;
			}
		})
		.join(", ");
}

function ModelRow({
	model,
	starting,
	onDownload,
}: {
	model: ModelStatus;
	starting: boolean;
	onDownload: () => void;
}) {
	const downloading = model.pulling || starting;
	return (
		<SettingControlRow
			label={
				<span className="font-medium text-foreground text-sm">
					{modelLanguageLabel(model.languages)}
				</span>
			}
			description={
				<span className="flex flex-col gap-0.5">
					<span>
						{model.id} ·{" "}
						{m["settings.honomiya.model_size"]({ size: model.sizeMiB })}
					</span>
					{model.error && !downloading && (
						<span className="text-destructive">
							{m["settings.honomiya.model_download_failed"]({
								error: model.error,
							})}
						</span>
					)}
				</span>
			}
		>
			{model.installed ? (
				<Badge variant="success">
					{m["settings.honomiya.model_installed"]()}
				</Badge>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={downloading}
					onClick={onDownload}
				>
					{downloading ? (
						<CircleNotch
							data-icon="inline-start"
							className="animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					) : (
						<DownloadSimple data-icon="inline-start" aria-hidden="true" />
					)}
					{downloading
						? m["settings.honomiya.model_downloading"]()
						: m["settings.honomiya.model_download"]()}
				</Button>
			)}
		</SettingControlRow>
	);
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
