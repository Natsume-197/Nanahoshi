import {
	CheckCircle,
	CircleNotch,
	FloppyDisk,
	PencilSimpleLine,
	Warning,
} from "@phosphor-icons/react";
import {
	type UseQueryOptions,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	PROVIDER_INFO,
	PROVIDERS_BY_MEDIA_TYPE,
} from "@/components/libraries/provider-priority-list";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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
import { AMAZON_DOMAINS } from "@/lib/amazon-domains";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

type EbookProviderId = (typeof PROVIDERS_BY_MEDIA_TYPE.ebook)[number];
type ToggleConfig = { enabled: boolean };

type ProviderView = {
	iconSrc: string;
	iconClassName?: string;
	description: () => string;
};

const PROVIDER_VIEW: Record<EbookProviderId, ProviderView> = {
	ranobedb: {
		iconSrc: "/provider-icons/ranobedb.png",
		iconClassName: "size-7",
		description: PROVIDER_INFO.ranobedb.description,
	},
	amazon: {
		iconSrc: "/provider-icons/amazon.png",
		description: PROVIDER_INFO.amazon.description,
	},
	googlebooks: {
		iconSrc: "/provider-icons/google-books.png",
		description: PROVIDER_INFO.googlebooks.description,
	},
	openlibrary: {
		iconSrc: "/provider-icons/open-library.png",
		iconClassName: "size-7",
		description: PROVIDER_INFO.openlibrary.description,
	},
	goodreads: {
		iconSrc: "/provider-icons/goodreads.png",
		description: PROVIDER_INFO.goodreads.description,
	},
	hardcover: {
		iconSrc: "/provider-icons/hardcover.svg",
		iconClassName: "size-7",
		description: PROVIDER_INFO.hardcover.description,
	},
	comicvine: {
		iconSrc: "/provider-icons/comic-vine.png",
		iconClassName: "h-auto w-8",
		description: PROVIDER_INFO.comicvine.description,
	},
};

type ProviderStatus = {
	tone: "ready" | "warning";
	label: string;
};

function ProviderCard({
	provider,
	enabled,
	isLoading,
	isPending,
	onToggle,
	onConfigure,
	configurationRequired = false,
	status,
}: {
	provider: EbookProviderId;
	enabled: boolean;
	isLoading: boolean;
	isPending: boolean;
	onToggle: (enabled: boolean) => void;
	onConfigure?: () => void;
	configurationRequired?: boolean;
	status?: ProviderStatus;
}) {
	const info = PROVIDER_INFO[provider];
	const view = PROVIDER_VIEW[provider];
	const titleId = `metadata-provider-${provider}-title`;
	const descriptionId = `metadata-provider-${provider}-description`;

	return (
		<Card
			role="article"
			aria-labelledby={titleId}
			aria-busy={isLoading || isPending}
			className="h-full gap-0 rounded-xl border border-foreground/10 bg-card py-0 shadow-none ring-0 dark:bg-[color-mix(in_oklab,var(--background)_86%,black)] dark:text-foreground"
		>
			<CardHeader className="px-5 pt-5">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-white shadow-xs dark:border-white/10">
						<img
							src={view.iconSrc}
							alt=""
							className={cn("size-6 object-contain", view.iconClassName)}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<CardTitle id={titleId}>{info.label}</CardTitle>
					</div>
				</div>
				<CardAction className="flex min-h-10 items-center ps-3">
					{isLoading ? (
						<Skeleton className="h-5 w-8 rounded-2xl" />
					) : (
						<Switch
							checked={enabled}
							onCheckedChange={onToggle}
							disabled={isPending}
							aria-label={m["library.provider_enable"]({ name: info.label })}
							aria-describedby={descriptionId}
						/>
					)}
				</CardAction>
			</CardHeader>
			<CardContent className="flex-1 px-5 pt-3 pb-5">
				<CardDescription
					id={descriptionId}
					className="text-pretty text-foreground/65 leading-relaxed"
				>
					{view.description()}
				</CardDescription>
			</CardContent>
			<CardFooter className="border-foreground/10 border-t px-0 [.border-t]:pt-0">
				{onConfigure ? (
					<Button
						type="button"
						variant="ghost"
						onClick={onConfigure}
						disabled={isLoading || isPending}
						className="h-12 w-full justify-start rounded-none px-5 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
					>
						{configurationRequired ? (
							<Warning
								data-icon="inline-start"
								className="text-warning"
								aria-hidden
							/>
						) : (
							<PencilSimpleLine data-icon="inline-start" aria-hidden />
						)}
						{m["settings.metadata.configure_provider"]({
							provider: info.label,
						})}
					</Button>
				) : (
					<div className="flex min-h-12 w-full items-center gap-2 px-5 text-foreground/70 text-sm">
						{status?.tone === "warning" ? (
							<Warning className="size-4 shrink-0 text-warning" aria-hidden />
						) : (
							<CheckCircle className="size-4 shrink-0" aria-hidden />
						)}
						<span>
							{status?.label ?? m["settings.metadata.ready_to_use"]()}
						</span>
					</div>
				)}
			</CardFooter>
		</Card>
	);
}

function useProviderMutation<
	TConfig extends ToggleConfig,
	TPatch extends object,
>({
	queryKey,
	update,
	updatedMessage,
	cacheResult = true,
}: {
	queryKey: readonly unknown[];
	update: (patch: TPatch) => Promise<TConfig>;
	updatedMessage: string;
	cacheResult?: boolean;
}) {
	return useMutation({
		mutationFn: update,
		onSuccess: (next) => {
			if (cacheResult) queryClient.setQueryData(queryKey, next);
			queryClient.invalidateQueries({ queryKey });
			toast.success(updatedMessage);
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["settings.metadata.update_failed"]()),
			),
	});
}

// Per-organization metadata-source config. The available cards come from the
// same ebook provider catalog used by each library's priority editor.
export function MetadataOrgSettings() {
	return (
		<section
			aria-labelledby="metadata-providers-title"
			className="@container/metadata-providers flex flex-col gap-7"
		>
			<div className="flex max-w-2xl flex-col gap-1.5">
				<h2
					id="metadata-providers-title"
					className="font-semibold text-2xl text-foreground tracking-tight"
				>
					{m["settings.metadata.providers_title"]()}
				</h2>
				<p className="text-pretty text-foreground/65 text-sm leading-relaxed">
					{m["settings.metadata.providers_desc"]()}
				</p>
			</div>

			<div className="grid @3xl/metadata-providers:grid-cols-2 grid-cols-1 gap-5">
				{PROVIDERS_BY_MEDIA_TYPE.ebook.map((provider) => (
					<ProviderEntry key={provider} provider={provider} />
				))}
			</div>
		</section>
	);
}

function ProviderEntry({ provider }: { provider: EbookProviderId }) {
	switch (provider) {
		case "ranobedb":
			return <RanobedbProvider />;
		case "amazon":
			return <AmazonProvider />;
		case "googlebooks":
			return <GoogleBooksProvider />;
		case "openlibrary":
			return (
				<SimpleProvider
					provider="openlibrary"
					query={() => orpc.settings.getOpenLibrary.queryOptions()}
					update={(patch) => client.settings.updateOpenLibrary(patch)}
					updatedMessage={m["settings.metadata.openlibrary_updated"]()}
				/>
			);
		case "goodreads":
			return (
				<SimpleProvider
					provider="goodreads"
					query={() => orpc.settings.getGoodreads.queryOptions()}
					update={(patch) => client.settings.updateGoodreads(patch)}
					updatedMessage={m["settings.metadata.goodreads_updated"]()}
				/>
			);
		case "hardcover":
			return (
				<CredentialProvider
					provider="hardcover"
					query={() => orpc.settings.getHardcover.queryOptions()}
					readCredential={(config) => config.apiToken ?? ""}
					update={({ enabled, credential }) =>
						client.settings.updateHardcover({
							enabled,
							apiToken: credential,
						})
					}
					credentialLabel={m["settings.metadata.hardcover_token"]()}
					credentialDescription={m["settings.metadata.hardcover_token_desc"]()}
					credentialPlaceholder="Bearer token"
					updatedMessage={m["settings.metadata.hardcover_updated"]()}
				/>
			);
		case "comicvine":
			return (
				<CredentialProvider
					provider="comicvine"
					query={() => orpc.settings.getComicvine.queryOptions()}
					readCredential={(config) => config.apiKey ?? ""}
					update={({ enabled, credential }) =>
						client.settings.updateComicvine({
							enabled,
							apiKey: credential,
						})
					}
					credentialLabel={m["settings.metadata.comicvine_key"]()}
					credentialDescription={m["settings.metadata.comicvine_key_desc"]()}
					credentialPlaceholder="api_key"
					updatedMessage={m["settings.metadata.comicvine_updated"]()}
				/>
			);
	}
}

function RanobedbProvider() {
	const options = orpc.settings.getRanobedb.queryOptions();
	const { data: config, isLoading } = useQuery(options);
	const mutation = useProviderMutation({
		queryKey: options.queryKey,
		update: (patch: { enabled?: boolean }) =>
			client.settings.updateRanobedb(patch),
		updatedMessage: m["settings.metadata.ranobedb_updated"](),
		cacheResult: false,
	});
	const unavailable = Boolean(config && !config.dbReady);

	return (
		<ProviderCard
			provider="ranobedb"
			enabled={config?.enabled ?? true}
			isLoading={isLoading}
			isPending={mutation.isPending}
			onToggle={(enabled) => mutation.mutate({ enabled })}
			status={
				unavailable
					? {
							tone: "warning",
							label: m["settings.metadata.ranobedb_dump_missing_short"](),
						}
					: undefined
			}
		/>
	);
}

function SimpleProvider<TConfig extends ToggleConfig>({
	provider,
	query,
	update,
	updatedMessage,
}: {
	provider: "openlibrary" | "goodreads";
	query: () => { queryKey: readonly unknown[] };
	update: (patch: { enabled: boolean }) => Promise<TConfig>;
	updatedMessage: string;
}) {
	const options = query();
	const { data: config, isLoading } = useQuery(
		options as unknown as UseQueryOptions<TConfig, Error>,
	);
	const mutation = useProviderMutation({
		queryKey: options.queryKey,
		update,
		updatedMessage,
	});

	return (
		<ProviderCard
			provider={provider}
			enabled={config?.enabled ?? true}
			isLoading={isLoading}
			isPending={mutation.isPending}
			onToggle={(enabled) => mutation.mutate({ enabled })}
		/>
	);
}

function AmazonProvider() {
	const options = orpc.settings.getAmazon.queryOptions();
	const { data: config, isLoading } = useQuery(options);
	const mutation = useProviderMutation({
		queryKey: options.queryKey,
		update: (patch: { domain?: string; cookie?: string; enabled?: boolean }) =>
			client.settings.updateAmazon(patch),
		updatedMessage: m["settings.metadata.amazon_updated"](),
	});
	const [open, setOpen] = useState(false);
	const [domain, setDomain] = useState("co.jp");
	const [cookie, setCookie] = useState("");

	const openConfiguration = () => {
		setDomain(config?.domain ?? "co.jp");
		setCookie(config?.cookie ?? "");
		setOpen(true);
	};

	return (
		<>
			<ProviderCard
				provider="amazon"
				enabled={config?.enabled ?? true}
				isLoading={isLoading}
				isPending={mutation.isPending}
				onToggle={(enabled) => mutation.mutate({ enabled })}
				onConfigure={openConfiguration}
			/>
			<Modal
				open={open}
				onOpenChange={(next) => {
					if (!next && !mutation.isPending) setOpen(false);
				}}
				title={m["settings.metadata.configuration_title"]({
					provider: PROVIDER_INFO.amazon.label,
				})}
				description={m["settings.metadata.amazon_configuration_desc"]()}
				onSubmit={(event) => {
					event.preventDefault();
					mutation.mutate(
						{ domain, cookie },
						{ onSuccess: () => setOpen(false) },
					);
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={mutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</>
				}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="amazon-domain">
							{m["settings.metadata.amazon_domain"]()}
						</FieldLabel>
						<FieldDescription id="amazon-domain-description">
							{m["settings.metadata.amazon_domain_desc"]()}
						</FieldDescription>
						<Select
							value={domain}
							onValueChange={setDomain}
							items={AMAZON_DOMAINS.map((item) => ({
								value: item.value,
								label: item.label,
							}))}
						>
							<SelectTrigger
								id="amazon-domain"
								aria-describedby="amazon-domain-description"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{AMAZON_DOMAINS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="amazon-cookie">
							{m["settings.metadata.cookie_optional"]()}
						</FieldLabel>
						<FieldDescription id="amazon-cookie-description">
							{m["settings.metadata.amazon_cookie_desc"]()}
						</FieldDescription>
						<Input
							id="amazon-cookie"
							name="amazon-cookie"
							type="password"
							autoComplete="off"
							value={cookie}
							onChange={(event) => setCookie(event.target.value)}
							placeholder="session-id=...; session-id-time=..."
							aria-describedby="amazon-cookie-description"
						/>
					</Field>
				</FieldGroup>
			</Modal>
		</>
	);
}

function GoogleBooksProvider() {
	const options = orpc.settings.getGoogleBooks.queryOptions();
	const { data: config, isLoading } = useQuery(options);
	const mutation = useProviderMutation({
		queryKey: options.queryKey,
		update: (patch: {
			enabled?: boolean;
			apiKey?: string;
			langRestrict?: string;
		}) => client.settings.updateGoogleBooks(patch),
		updatedMessage: m["settings.metadata.googlebooks_updated"](),
	});
	const [open, setOpen] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [langRestrict, setLangRestrict] = useState("");

	const openConfiguration = () => {
		setApiKey(config?.apiKey ?? "");
		setLangRestrict(config?.langRestrict ?? "");
		setOpen(true);
	};

	return (
		<>
			<ProviderCard
				provider="googlebooks"
				enabled={config?.enabled ?? true}
				isLoading={isLoading}
				isPending={mutation.isPending}
				onToggle={(enabled) => mutation.mutate({ enabled })}
				onConfigure={openConfiguration}
			/>
			<Modal
				open={open}
				onOpenChange={(next) => {
					if (!next && !mutation.isPending) setOpen(false);
				}}
				title={m["settings.metadata.configuration_title"]({
					provider: PROVIDER_INFO.googlebooks.label,
				})}
				description={m["settings.metadata.googlebooks_configuration_desc"]()}
				onSubmit={(event) => {
					event.preventDefault();
					mutation.mutate(
						{ apiKey, langRestrict },
						{ onSuccess: () => setOpen(false) },
					);
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={mutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</>
				}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="googlebooks-api-key">
							{m["settings.metadata.googlebooks_key"]()}
						</FieldLabel>
						<FieldDescription id="googlebooks-key-description">
							{m["settings.metadata.googlebooks_key_desc"]()}
						</FieldDescription>
						<Input
							id="googlebooks-api-key"
							name="googlebooks-api-key"
							type="password"
							autoComplete="off"
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
							placeholder="AIza..."
							aria-describedby="googlebooks-key-description"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="googlebooks-language">
							{m["settings.metadata.googlebooks_lang"]()}
						</FieldLabel>
						<FieldDescription id="googlebooks-language-description">
							{m["settings.metadata.googlebooks_lang_desc"]()}
						</FieldDescription>
						<Input
							id="googlebooks-language"
							name="googlebooks-language"
							value={langRestrict}
							onChange={(event) => setLangRestrict(event.target.value)}
							placeholder="ja"
							maxLength={8}
							aria-describedby="googlebooks-language-description"
						/>
					</Field>
				</FieldGroup>
			</Modal>
		</>
	);
}

type CredentialConfig = ToggleConfig & {
	apiKey?: string;
	apiToken?: string;
};

function CredentialProvider({
	provider,
	query,
	readCredential,
	update,
	credentialLabel,
	credentialDescription,
	credentialPlaceholder,
	updatedMessage,
}: {
	provider: "hardcover" | "comicvine";
	query: () => { queryKey: readonly unknown[] };
	readCredential: (config: CredentialConfig) => string;
	update: (patch: {
		enabled?: boolean;
		credential?: string;
	}) => Promise<CredentialConfig>;
	credentialLabel: string;
	credentialDescription: string;
	credentialPlaceholder: string;
	updatedMessage: string;
}) {
	const options = query();
	const { data: config, isLoading } = useQuery(
		options as unknown as UseQueryOptions<CredentialConfig, Error>,
	);
	const mutation = useProviderMutation({
		queryKey: options.queryKey,
		update,
		updatedMessage,
	});
	const [open, setOpen] = useState(false);
	const [credential, setCredential] = useState("");
	const configured = Boolean(config && readCredential(config).trim());
	const info = PROVIDER_INFO[provider];

	const openConfiguration = () => {
		setCredential(config ? readCredential(config) : "");
		setOpen(true);
	};

	return (
		<>
			<ProviderCard
				provider={provider}
				enabled={config?.enabled ?? true}
				isLoading={isLoading}
				isPending={mutation.isPending}
				onToggle={(enabled) => mutation.mutate({ enabled })}
				onConfigure={openConfiguration}
				configurationRequired={!configured}
			/>
			<Modal
				open={open}
				onOpenChange={(next) => {
					if (!next && !mutation.isPending) setOpen(false);
				}}
				title={m["settings.metadata.configuration_title"]({
					provider: info.label,
				})}
				description={PROVIDER_VIEW[provider].description()}
				onSubmit={(event) => {
					event.preventDefault();
					mutation.mutate({ credential }, { onSuccess: () => setOpen(false) });
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={mutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</>
				}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={`${provider}-credential`}>
							{credentialLabel}
						</FieldLabel>
						<FieldDescription id={`${provider}-credential-description`}>
							{credentialDescription}
						</FieldDescription>
						<Input
							id={`${provider}-credential`}
							name={`${provider}-credential`}
							type="password"
							autoComplete="off"
							value={credential}
							onChange={(event) => setCredential(event.target.value)}
							placeholder={credentialPlaceholder}
							aria-describedby={`${provider}-credential-description`}
						/>
					</Field>
				</FieldGroup>
			</Modal>
		</>
	);
}
