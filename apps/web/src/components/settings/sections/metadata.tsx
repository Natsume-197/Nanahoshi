import { CircleNotch, FloppyDisk, Warning } from "@phosphor-icons/react";
import {
	type UseQueryOptions,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

// Per-organization metadata-source config. Tenant-scoped because the Amazon
// cookie is a credential and the store/toggle follow the organization, not the
// whole instance. The shared RanobeDB dump import stays in app-owner settings.
export function MetadataOrgSettings() {
	return (
		<div className="flex flex-col gap-12">
			<AmazonSection />
			<RanobedbSection />
			<GoogleBooksSection />
			<ProviderToggleSection
				title="Open Library"
				idPrefix="openlibrary"
				description={m["settings.metadata.openlibrary_desc"]()}
				query={() => orpc.settings.getOpenLibrary.queryOptions()}
				update={(data) => client.settings.updateOpenLibrary(data)}
				updatedMessage={m["settings.metadata.openlibrary_updated"]()}
				enabledLabel={m["settings.metadata.openlibrary_enabled"]()}
				enabledDesc={m["settings.metadata.openlibrary_enabled_desc"]()}
			/>
			<ProviderToggleSection
				title="Goodreads"
				idPrefix="goodreads"
				description={m["settings.metadata.goodreads_desc"]()}
				query={() => orpc.settings.getGoodreads.queryOptions()}
				update={(data) => client.settings.updateGoodreads(data)}
				updatedMessage={m["settings.metadata.goodreads_updated"]()}
				enabledLabel={m["settings.metadata.goodreads_enabled"]()}
				enabledDesc={m["settings.metadata.goodreads_enabled_desc"]()}
			/>
			<ProviderKeySection
				title="Hardcover"
				idPrefix="hardcover"
				description={m["settings.metadata.hardcover_desc"]()}
				keyField="apiToken"
				keyLabel={m["settings.metadata.hardcover_token"]()}
				keyDesc={m["settings.metadata.hardcover_token_desc"]()}
				keyPlaceholder="Bearer token"
				query={() => orpc.settings.getHardcover.queryOptions()}
				update={(data) => client.settings.updateHardcover(data)}
				updatedMessage={m["settings.metadata.hardcover_updated"]()}
				enabledLabel={m["settings.metadata.hardcover_enabled"]()}
				enabledDesc={m["settings.metadata.hardcover_enabled_desc"]()}
			/>
			<ProviderKeySection
				title="Comic Vine"
				idPrefix="comicvine"
				description={m["settings.metadata.comicvine_desc"]()}
				keyField="apiKey"
				keyLabel={m["settings.metadata.comicvine_key"]()}
				keyDesc={m["settings.metadata.comicvine_key_desc"]()}
				keyPlaceholder="api_key"
				query={() => orpc.settings.getComicvine.queryOptions()}
				update={(data) => client.settings.updateComicvine(data)}
				updatedMessage={m["settings.metadata.comicvine_updated"]()}
				enabledLabel={m["settings.metadata.comicvine_enabled"]()}
				enabledDesc={m["settings.metadata.comicvine_enabled_desc"]()}
			/>
		</div>
	);
}

function AmazonSection() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getAmazon.queryOptions(),
	);

	const [domain, setDomain] = useState("co.jp");
	const [enabled, setEnabled] = useState(true);
	const [cookie, setCookie] = useState("");
	const prevConfigRef = useRef(config);

	if (config && config !== prevConfigRef.current) {
		prevConfigRef.current = config;
		setDomain(config.domain);
		setEnabled(config.enabled);
		setCookie(config.cookie ?? "");
	}

	const updateMutation = useMutation({
		mutationFn: (data: {
			domain?: string;
			enabled?: boolean;
			cookie?: string;
		}) => client.settings.updateAmazon(data),
		onSuccess: () => {
			toast.success(m["settings.metadata.amazon_updated"]());
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getAmazon.queryOptions().queryKey,
			});
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.metadata.update_failed"]())),
	});

	const hasChanges =
		config &&
		(domain !== config.domain ||
			enabled !== config.enabled ||
			cookie !== (config.cookie ?? ""));

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">Amazon</h2>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.metadata.amazon_desc"]()}
				</p>
			</div>

			{isLoading ? (
				<SettingRows>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</SettingRows>
			) : (
				<div className="flex flex-col gap-6">
					<SettingRows>
						<SettingControlRow
							label={
								<Label
									htmlFor="amazon-enabled"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.amazon_enabled"]()}
								</Label>
							}
							description={m["settings.metadata.amazon_enabled_desc"]()}
						>
							<Switch
								id="amazon-enabled"
								checked={enabled}
								onCheckedChange={setEnabled}
							/>
						</SettingControlRow>

						<SettingControlRow
							label={
								<Label
									htmlFor="amazon-domain"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.amazon_domain"]()}
								</Label>
							}
							description={m["settings.metadata.amazon_domain_desc"]()}
						>
							<Select
								value={domain}
								onValueChange={setDomain}
								items={AMAZON_DOMAINS.map((d) => ({
									value: d.value,
									label: d.label,
								}))}
							>
								<SelectTrigger id="amazon-domain" className="w-full sm:w-64">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{AMAZON_DOMAINS.map((d) => (
											<SelectItem key={d.value} value={d.value}>
												{d.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</SettingControlRow>

						<SettingControlRow
							label={
								<Label
									htmlFor="amazon-cookie"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.cookie_optional"]()}
								</Label>
							}
							description={m["settings.metadata.amazon_cookie_desc"]()}
						>
							<Input
								id="amazon-cookie"
								type="password"
								value={cookie}
								onChange={(e) => setCookie(e.target.value)}
								placeholder="session-id=...; session-id-time=..."
								disabled={!enabled}
								className="w-full sm:w-80"
							/>
						</SettingControlRow>
					</SettingRows>

					<div className="flex justify-end">
						<Button
							onClick={() =>
								updateMutation.mutate({
									domain,
									enabled,
									cookie: cookie || undefined,
								})
							}
							disabled={updateMutation.isPending || !hasChanges}
							size="sm"
						>
							{updateMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}

function RanobedbSection() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRanobedb.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: { enabled?: boolean }) =>
			client.settings.updateRanobedb(data),
		onSuccess: () => {
			toast.success(m["settings.metadata.ranobedb_updated"]());
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getRanobedb.queryOptions().queryKey,
			});
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.metadata.update_failed"]())),
	});

	const enabled = config?.enabled ?? true;

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">RanobeDB</h2>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.metadata.ranobedb_desc"]()}
				</p>
			</div>

			{isLoading ? (
				<Skeleton className="h-12 w-full" />
			) : (
				<SettingControlRow
					label={
						<Label
							htmlFor="ranobedb-enabled"
							className="font-medium text-base text-foreground"
						>
							{m["settings.metadata.ranobedb_enabled"]()}
						</Label>
					}
					description={m["settings.metadata.ranobedb_enabled_desc"]()}
				>
					<Switch
						id="ranobedb-enabled"
						checked={enabled}
						onCheckedChange={(checked) =>
							updateMutation.mutate({ enabled: checked })
						}
						disabled={updateMutation.isPending}
					/>
				</SettingControlRow>
			)}

			{config && !config.dbReady && (
				<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
					<Warning className="mt-0.5 size-4 shrink-0" />
					<span>{m["settings.metadata.ranobedb_dump_missing"]()}</span>
				</div>
			)}
		</section>
	);
}

function GoogleBooksSection() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getGoogleBooks.queryOptions(),
	);

	const [enabled, setEnabled] = useState(true);
	const [apiKey, setApiKey] = useState("");
	const [langRestrict, setLangRestrict] = useState("");
	const prevConfigRef = useRef(config);

	if (config && config !== prevConfigRef.current) {
		prevConfigRef.current = config;
		setEnabled(config.enabled);
		setApiKey(config.apiKey ?? "");
		setLangRestrict(config.langRestrict ?? "");
	}

	const updateMutation = useMutation({
		mutationFn: (data: {
			enabled?: boolean;
			apiKey?: string;
			langRestrict?: string;
		}) => client.settings.updateGoogleBooks(data),
		onSuccess: () => {
			toast.success(m["settings.metadata.googlebooks_updated"]());
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getGoogleBooks.queryOptions().queryKey,
			});
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.metadata.update_failed"]())),
	});

	const hasChanges =
		config &&
		(enabled !== config.enabled ||
			apiKey !== (config.apiKey ?? "") ||
			langRestrict !== (config.langRestrict ?? ""));

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">Google Books</h2>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.metadata.googlebooks_desc"]()}
				</p>
			</div>

			{isLoading ? (
				<SettingRows>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</SettingRows>
			) : (
				<div className="flex flex-col gap-6">
					<SettingRows>
						<SettingControlRow
							label={
								<Label
									htmlFor="googlebooks-enabled"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.googlebooks_enabled"]()}
								</Label>
							}
							description={m["settings.metadata.googlebooks_enabled_desc"]()}
						>
							<Switch
								id="googlebooks-enabled"
								checked={enabled}
								onCheckedChange={setEnabled}
							/>
						</SettingControlRow>

						<SettingControlRow
							label={
								<Label
									htmlFor="googlebooks-api-key"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.googlebooks_key"]()}
								</Label>
							}
							description={m["settings.metadata.googlebooks_key_desc"]()}
						>
							<Input
								id="googlebooks-api-key"
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder="AIza..."
								disabled={!enabled}
								className="w-full sm:w-80"
							/>
						</SettingControlRow>

						<SettingControlRow
							label={
								<Label
									htmlFor="googlebooks-lang"
									className="font-medium text-base text-foreground"
								>
									{m["settings.metadata.googlebooks_lang"]()}
								</Label>
							}
							description={m["settings.metadata.googlebooks_lang_desc"]()}
						>
							<Input
								id="googlebooks-lang"
								value={langRestrict}
								onChange={(e) => setLangRestrict(e.target.value)}
								placeholder="ja"
								disabled={!enabled}
								className="w-full sm:w-24"
							/>
						</SettingControlRow>
					</SettingRows>

					<div className="flex justify-end">
						<Button
							onClick={() =>
								updateMutation.mutate({ enabled, apiKey, langRestrict })
							}
							disabled={updateMutation.isPending || !hasChanges}
							size="sm"
						>
							{updateMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}

type ToggleConfig = { enabled: boolean };

// Simple enabled-only provider section (Open Library, Goodreads).
function ProviderToggleSection({
	title,
	idPrefix,
	description,
	query,
	update,
	updatedMessage,
	enabledLabel,
	enabledDesc,
}: {
	title: string;
	idPrefix: string;
	description: string;
	query: () => { queryKey: readonly unknown[] };
	update: (data: { enabled: boolean }) => Promise<unknown>;
	updatedMessage: string;
	enabledLabel: string;
	enabledDesc: string;
}) {
	const { data: config, isLoading } = useQuery(
		query() as unknown as UseQueryOptions<ToggleConfig, Error>,
	);

	const updateMutation = useMutation({
		mutationFn: update,
		onSuccess: () => {
			toast.success(updatedMessage);
			queryClient.invalidateQueries({ queryKey: query().queryKey });
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.metadata.update_failed"]())),
	});

	const enabled = config?.enabled ?? true;

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">{title}</h2>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>

			{isLoading ? (
				<Skeleton className="h-12 w-full" />
			) : (
				<SettingControlRow
					label={
						<Label
							htmlFor={`${idPrefix}-enabled`}
							className="font-medium text-base text-foreground"
						>
							{enabledLabel}
						</Label>
					}
					description={enabledDesc}
				>
					<Switch
						id={`${idPrefix}-enabled`}
						checked={enabled}
						onCheckedChange={(checked) =>
							updateMutation.mutate({ enabled: checked })
						}
						disabled={updateMutation.isPending}
					/>
				</SettingControlRow>
			)}
		</section>
	);
}

type KeyConfig = ToggleConfig & { apiKey?: string; apiToken?: string };

// Provider section with a toggle plus one credential field (Hardcover, Comic Vine).
function ProviderKeySection({
	title,
	idPrefix,
	description,
	keyField,
	keyLabel,
	keyDesc,
	keyPlaceholder,
	query,
	update,
	updatedMessage,
	enabledLabel,
	enabledDesc,
}: {
	title: string;
	idPrefix: string;
	description: string;
	keyField: "apiKey" | "apiToken";
	keyLabel: string;
	keyDesc: string;
	keyPlaceholder: string;
	query: () => { queryKey: readonly unknown[] };
	update: (data: {
		enabled?: boolean;
		apiKey?: string;
		apiToken?: string;
	}) => Promise<unknown>;
	updatedMessage: string;
	enabledLabel: string;
	enabledDesc: string;
}) {
	const { data: config, isLoading } = useQuery(
		query() as unknown as UseQueryOptions<KeyConfig, Error>,
	);

	const [enabled, setEnabled] = useState(true);
	const [key, setKey] = useState("");
	const prevConfigRef = useRef(config);

	if (config && config !== prevConfigRef.current) {
		prevConfigRef.current = config;
		setEnabled(config.enabled);
		setKey(config[keyField] ?? "");
	}

	const updateMutation = useMutation({
		mutationFn: update,
		onSuccess: () => {
			toast.success(updatedMessage);
			queryClient.invalidateQueries({ queryKey: query().queryKey });
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.metadata.update_failed"]())),
	});

	const hasChanges =
		config && (enabled !== config.enabled || key !== (config[keyField] ?? ""));

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">{title}</h2>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>

			{isLoading ? (
				<SettingRows>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-14 w-full" />
				</SettingRows>
			) : (
				<div className="flex flex-col gap-6">
					<SettingRows>
						<SettingControlRow
							label={
								<Label
									htmlFor={`${idPrefix}-enabled`}
									className="font-medium text-base text-foreground"
								>
									{enabledLabel}
								</Label>
							}
							description={enabledDesc}
						>
							<Switch
								id={`${idPrefix}-enabled`}
								checked={enabled}
								onCheckedChange={setEnabled}
							/>
						</SettingControlRow>

						<SettingControlRow
							label={
								<Label
									htmlFor={`${idPrefix}-key`}
									className="font-medium text-base text-foreground"
								>
									{keyLabel}
								</Label>
							}
							description={keyDesc}
						>
							<Input
								id={`${idPrefix}-key`}
								type="password"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder={keyPlaceholder}
								disabled={!enabled}
								className="w-full sm:w-80"
							/>
						</SettingControlRow>
					</SettingRows>

					<div className="flex justify-end">
						<Button
							onClick={() =>
								updateMutation.mutate({ enabled, [keyField]: key })
							}
							disabled={updateMutation.isPending || !hasChanges}
							size="sm"
						>
							{updateMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<FloppyDisk data-icon="inline-start" />
							)}
							{m["settings.profile.save_changes"]()}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
