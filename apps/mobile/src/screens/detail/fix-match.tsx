import {
	AUDIOBOOK_PREVIEW_FIELDS,
	AUDIOBOOK_PROVIDER_OPTIONS,
	audiobookCandidateMeta,
	BOOK_PREVIEW_FIELDS,
	BOOK_PROVIDER_OPTIONS,
	bookCandidateMeta,
	canSearchMatch,
	defaultSelectedFields,
	displayMetadataValue,
	type MatchCandidate,
	type MatchSearch,
	type MetadataPreview,
	matchFieldLabel,
	OUTCOME_MESSAGE_KEYS,
	type ProviderOption,
	previewCoverUrl,
	searchProviders,
} from "@nanahoshi/api/routers/books/metadata/fix-match";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { HeaderButton } from "@/components/header-button";
import { Icon, icons } from "@/components/icon";
import { showNotice } from "@/components/prompt";
import { RowSkeleton } from "@/components/skeleton";
import { ErrorState, Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { formatDuration } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { MediaKind } from "@/lib/routes";
import { audiobookDetailQueries, bookDetailQueries } from "@/lib/title-queries";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";

type Source = {
	providers: ProviderOption[];
	previewFields: readonly string[];
	current: Record<string, unknown>;
	initialTitle: string;
	initialAuthor: string;
	initialAsin: string;
	search: MatchSearch;
	preview: (candidate: MatchCandidate) => Promise<MetadataPreview | null>;
	apply: (candidate: MatchCandidate, fields: string[]) => Promise<boolean>;
	square: boolean;
};

/** The web's "Fix match" dialog: search the metadata sources, pick the
 * right entry, choose which of its fields replace this title's. Locked
 * (hand-edited) fields are never offered. */
export function FixMatch({ uuid, kind }: { uuid: string; kind: MediaKind }) {
	return (
		<>
			<Stack.Screen
				options={{
					title: t("match.dialog_title"),
					headerLeft: () => (
						<HeaderButton label={t("common.cancel")} onPress={router.back} />
					),
				}}
			/>
			{kind === "audiobook" ? (
				<AudiobookSource uuid={uuid} />
			) : (
				<BookSource uuid={uuid} />
			)}
		</>
	);
}

function BookSource({ uuid }: { uuid: string }) {
	const { orpc, client } = useApi();
	const detail = useQuery(bookDetailQueries(orpc, uuid).detail);
	// Only providers enabled and configured for this server can answer.
	const available = useQuery(
		orpc.books.availableMetadataProviders.queryOptions({
			input: { uuid },
			staleTime: 5 * 60 * 1000,
		}),
	);
	if (detail.isError || available.isError)
		return (
			<ErrorState
				onRetry={() => {
					void detail.refetch();
					void available.refetch();
				}}
			/>
		);
	if (!detail.data || !available.data) return <RowSkeleton count={4} square />;
	const book = detail.data;
	type Provider = Parameters<typeof client.books.searchMetadata>[0]["provider"];
	return (
		<MatchFlow
			source={{
				providers: BOOK_PROVIDER_OPTIONS.filter((option) =>
					available.data.some((id) => id === option.id),
				),
				previewFields: BOOK_PREVIEW_FIELDS,
				current: book as unknown as Record<string, unknown>,
				initialTitle: book.title ?? book.filename ?? "",
				initialAuthor: book.authors?.[0]?.name ?? "",
				initialAsin: book.asin ?? "",
				square: false,
				search: async ({ provider, ...query }) =>
					(
						await client.books.searchMetadata({
							uuid,
							provider: provider as Provider,
							...query,
						})
					).map((c) => ({
						provider: c.provider,
						providerId: c.providerId,
						title: c.title,
						subtitle: c.titleRomaji,
						metaLines: bookCandidateMeta(c),
						previewCover: c.previewCover,
						url: c.url,
					})),
				preview: (candidate) =>
					client.books.previewMetadata({
						uuid,
						provider: candidate.provider as Provider,
						providerId: candidate.providerId,
					}),
				apply: async (candidate, fields) =>
					(
						await client.books.applyMetadata({
							uuid,
							provider: candidate.provider as Provider,
							providerId: candidate.providerId,
							fields: fields as Parameters<
								typeof client.books.applyMetadata
							>[0]["fields"],
						})
					).success,
			}}
		/>
	);
}

function AudiobookSource({ uuid }: { uuid: string }) {
	const { orpc, client } = useApi();
	const detail = useQuery(audiobookDetailQueries(orpc, uuid).detail);
	if (detail.isError) return <ErrorState onRetry={() => detail.refetch()} />;
	if (!detail.data) return <RowSkeleton count={4} square />;
	const audiobook = detail.data;
	type Provider = "audible" | "itunes";
	return (
		<MatchFlow
			source={{
				providers: AUDIOBOOK_PROVIDER_OPTIONS,
				previewFields: AUDIOBOOK_PREVIEW_FIELDS,
				current: audiobook as unknown as Record<string, unknown>,
				initialTitle: audiobook.title ?? "",
				initialAuthor: audiobook.authors?.[0]?.name ?? "",
				initialAsin: audiobook.asin ?? "",
				square: true,
				search: async ({ provider, ...query }) =>
					(
						await client.audiobooks.searchMetadata({
							uuid,
							provider: provider as Provider,
							...query,
						})
					).map((c) => ({
						provider: c.provider,
						providerId: c.providerId,
						title: c.title ?? "",
						metaLines: audiobookCandidateMeta(c, formatDuration),
						previewCover: c.previewCover,
						url: c.url,
					})),
				preview: (candidate) =>
					client.audiobooks.previewMetadata({
						uuid,
						provider: candidate.provider as Provider,
						providerId: candidate.providerId,
					}),
				apply: async (candidate, fields) =>
					(await client.audiobooks.applyMetadata({
						uuid,
						provider: candidate.provider as Provider,
						providerId: candidate.providerId,
						fields: fields as Parameters<
							typeof client.audiobooks.applyMetadata
						>[0]["fields"],
					})) !== null,
			}}
		/>
	);
}

const providerLabel = (providers: ProviderOption[], id: string) =>
	providers.find((option) => option.id === id)?.label ?? id;

function MatchFlow({ source }: { source: Source }) {
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState<{
		candidate: MatchCandidate;
		preview: MetadataPreview;
	} | null>(null);
	const preview = useMutation({
		mutationFn: async (candidate: MatchCandidate) => ({
			candidate,
			preview: await source.preview(candidate),
		}),
		onSuccess: ({ candidate, preview: data }) => {
			if (data) setPicked({ candidate, preview: data });
			else showNotice(t("match.no_data"));
		},
		onError: (error) => showNotice(error.message || t("match.failed")),
	});
	const apply = useMutation({
		mutationFn: ({
			candidate,
			fields,
		}: {
			candidate: MatchCandidate;
			fields: string[];
		}) => source.apply(candidate, fields),
		onSuccess: async (applied) => {
			if (!applied) return showNotice(t("match.no_data"));
			haptics.success();
			await queryClient.invalidateQueries();
			router.back();
		},
		onError: (error) => showNotice(error.message || t("match.apply_failed")),
	});

	return picked ? (
		<PreviewStep
			key={`${picked.candidate.provider}:${picked.candidate.providerId}`}
			source={source}
			candidate={picked.candidate}
			preview={picked.preview}
			applying={apply.isPending}
			onBack={() => setPicked(null)}
			onApply={(fields) =>
				apply.mutate({ candidate: picked.candidate, fields })
			}
		/>
	) : (
		<SearchStep
			source={source}
			previewing={preview.isPending ? preview.variables : undefined}
			onPick={(candidate) => preview.mutate(candidate)}
		/>
	);
}

function SearchStep({
	source,
	previewing,
	onPick,
}: {
	source: Source;
	previewing: MatchCandidate | undefined;
	onPick: (candidate: MatchCandidate) => void;
}) {
	const [selected, setSelected] = useState(
		() => new Set(source.providers.map(({ id }) => id)),
	);
	const title = useRef(source.initialTitle);
	const author = useRef(source.initialAuthor);
	const asin = useRef(source.initialAsin);
	const [titleText, setTitleText] = useState(source.initialTitle);
	const [asinText, setAsinText] = useState(source.initialAsin);
	const { showAsin, canSearch } = canSearchMatch(
		source.providers,
		selected,
		titleText,
		asinText,
	);
	const query = (providerIds: string[], withAsin: boolean) => ({
		providerIds,
		title: title.current,
		author: author.current,
		asin: asin.current,
		withAsin,
	});
	// The title is already known, so the first search runs on its own.
	const [submitted, setSubmitted] = useState(() =>
		query(
			source.providers.map(({ id }) => id),
			source.providers.some((option) => option.supportsAsin),
		),
	);
	const results = useQuery({
		queryKey: ["fix-match-search", submitted],
		queryFn: () => searchProviders(submitted, source.search, source.providers),
		enabled:
			submitted.providerIds.length > 0 &&
			(submitted.title.trim() !== "" || submitted.asin.trim() !== ""),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});
	const search = () => {
		if (canSearch) setSubmitted(query([...selected], showAsin));
	};

	return (
		<ScrollView
			keyboardShouldPersistTaps="handled"
			automaticallyAdjustKeyboardInsets
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				gap: space.lg,
				paddingBottom: space.xxl * 2,
			}}
		>
			<Text variant="subhead" tone="secondary">
				{t("match.dialog_description")}
			</Text>
			{source.providers.length > 1 ? (
				<View style={{ gap: space.sm }}>
					<Text variant="label">{t("match.source")}</Text>
					<View
						style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
					>
						{source.providers.map((option) => (
							<Chip
								key={option.id}
								label={option.label}
								selected={selected.has(option.id)}
								onPress={() =>
									setSelected((previous) => {
										const next = new Set(previous);
										if (next.has(option.id)) next.delete(option.id);
										else next.add(option.id);
										return next;
									})
								}
							/>
						))}
					</View>
				</View>
			) : null}
			<TextField
				label={t("match.field_title")}
				defaultValue={source.initialTitle}
				onChangeText={(text) => {
					title.current = text;
					setTitleText(text);
				}}
				returnKeyType="search"
				onSubmitEditing={search}
			/>
			<TextField
				label={`${t("match.field_author")} (${t("match.optional")})`}
				defaultValue={source.initialAuthor}
				onChangeText={(text) => {
					author.current = text;
				}}
				returnKeyType="search"
				onSubmitEditing={search}
			/>
			{showAsin ? (
				<TextField
					label={`${t("match.field_asin")} (${t("match.optional")})`}
					defaultValue={source.initialAsin}
					onChangeText={(text) => {
						asin.current = text;
						setAsinText(text);
					}}
					autoCapitalize="characters"
					autoCorrect={false}
					returnKeyType="search"
					onSubmitEditing={search}
				/>
			) : null}
			<Button
				label={t("match.search")}
				disabled={!canSearch}
				loading={results.isFetching}
				onPress={search}
			/>
			{results.data && results.data.outcomes.length > 0 ? (
				<Text variant="caption" tone="secondary">
					{results.data.outcomes
						.map(
							(outcome) =>
								`${providerLabel(source.providers, outcome.provider)}: ${t(OUTCOME_MESSAGE_KEYS[outcome.status], { count: outcome.count })}`,
						)
						.join(" · ")}
				</Text>
			) : null}
			{results.isFetching ? (
				<RowSkeleton count={3} square />
			) : results.data?.candidates.length === 0 ? (
				<Text tone="secondary" style={{ textAlign: "center" }}>
					{t("match.no_results")}
				</Text>
			) : (
				<View style={{ gap: space.sm }}>
					{(results.data?.candidates ?? []).map((candidate) => (
						<CandidateRow
							key={`${candidate.provider}-${candidate.providerId}`}
							candidate={candidate}
							providerLabel={providerLabel(
								source.providers,
								candidate.provider,
							)}
							square={source.square}
							busy={
								previewing?.provider === candidate.provider &&
								previewing.providerId === candidate.providerId
							}
							disabled={!!previewing}
							onPress={() => onPick(candidate)}
						/>
					))}
				</View>
			)}
			{results.isError ? <Text tone="danger">{t("match.failed")}</Text> : null}
		</ScrollView>
	);
}

function CandidateRow({
	candidate,
	providerLabel,
	square,
	busy,
	disabled,
	onPress,
}: {
	candidate: MatchCandidate;
	providerLabel: string;
	square: boolean;
	busy: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	const cover = previewCoverUrl(candidate.previewCover);
	const width = square ? 56 : 44;
	// The whole row picks it: its fields are reviewed before anything changes.
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${t("match.use_this")}: ${candidate.title}`}
			disabled={disabled}
			onPress={onPress}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.md,
				borderRadius: radius.card,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surface
						: "transparent",
			})}
		>
			<View
				style={{
					width,
					height: square ? 56 : 64,
					borderRadius: 4,
					overflow: "hidden",
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{cover ? (
					<Image
						source={{ uri: cover }}
						style={{ width: "100%", height: "100%" }}
						contentFit="cover"
					/>
				) : (
					<Icon name={icons.book} size={18} color={palette.textSecondary} />
				)}
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="caption"
					tone="secondary"
					style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
				>
					{providerLabel}
				</Text>
				<Text variant="body" numberOfLines={2} style={{ fontWeight: "600" }}>
					{candidate.title}
				</Text>
				{[candidate.subtitle, ...candidate.metaLines]
					.filter(Boolean)
					.map((line) => (
						<Text
							key={line}
							variant="caption"
							tone="secondary"
							numberOfLines={1}
						>
							{line}
						</Text>
					))}
			</View>
			{busy ? (
				<Spinner inline tone="primary" />
			) : (
				<Icon
					name={icons.chevronRight}
					size={16}
					color={palette.textSecondary}
				/>
			)}
		</Pressable>
	);
}

function PreviewStep({
	source,
	candidate,
	preview,
	applying,
	onBack,
	onApply,
}: {
	source: Source;
	candidate: MatchCandidate;
	preview: MetadataPreview;
	applying: boolean;
	onBack: () => void;
	onApply: (fields: string[]) => void;
}) {
	const palette = usePalette();
	const [selected, setSelected] = useState(() =>
		defaultSelectedFields(source.previewFields, preview, source.current),
	);
	const locked = new Set(preview.lockedFields);
	const fields = source.previewFields.filter(
		(field) => preview.metadata[field] != null,
	);
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				gap: space.lg,
				paddingBottom: space.xxl * 2,
			}}
		>
			<View style={{ gap: space.xs }}>
				<Text variant="headline">{candidate.title}</Text>
				<Text variant="caption" tone="secondary">
					{providerLabel(source.providers, candidate.provider)}
				</Text>
			</View>
			<View
				style={{
					borderRadius: radius.card,
					borderCurve: "continuous",
					borderWidth: 1,
					borderColor: palette.separator,
					overflow: "hidden",
				}}
			>
				{fields.map((field, index) => {
					const isLocked = locked.has(field);
					const on = selected.has(field);
					return (
						<Pressable
							key={field}
							accessibilityRole="checkbox"
							accessibilityState={{ checked: on, disabled: isLocked }}
							accessibilityHint={isLocked ? t("match.locked_field") : undefined}
							disabled={isLocked}
							onPress={() =>
								setSelected((previous) => {
									const next = new Set(previous);
									if (next.has(field)) next.delete(field);
									else next.add(field);
									return next;
								})
							}
							android_ripple={{ color: palette.ripple }}
							style={{
								flexDirection: "row",
								gap: space.md,
								padding: space.md,
								borderTopWidth: index === 0 ? 0 : 1,
								borderColor: palette.separator,
								opacity: isLocked ? 0.5 : 1,
							}}
						>
							<Icon
								name={
									isLocked
										? icons.locked
										: on
											? icons.checkCircle
											: icons.circle
								}
								size={20}
								color={on ? palette.text : palette.textSecondary}
							/>
							<View style={{ flex: 1, gap: 4 }}>
								<Text variant="label">{matchFieldLabel(field, t)}</Text>
								<Text variant="caption" tone="secondary" numberOfLines={3}>
									{`${t("match.current_value")}: ${displayMetadataValue(source.current[field])}`}
								</Text>
								<Text variant="caption" numberOfLines={4}>
									{`${t("match.incoming_value")}: ${displayMetadataValue(preview.metadata[field])}`}
								</Text>
							</View>
						</Pressable>
					);
				})}
			</View>
			<Button
				label={`${t("match.use_this")} (${selected.size})`}
				disabled={selected.size === 0}
				loading={applying}
				onPress={() => onApply([...selected])}
			/>
			<Button variant="secondary" label={t("match.back")} onPress={onBack} />
		</ScrollView>
	);
}
