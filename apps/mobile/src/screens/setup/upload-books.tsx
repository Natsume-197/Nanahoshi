import { MAX_UPLOAD_BYTES } from "@nanahoshi/api/modules/scanning/supportedExtensions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File, UploadType } from "expo-file-system";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { Icon, icons } from "@/components/icon";
import { ProgressBar } from "@/components/progress-bar";
import { askChoice, showNotice } from "@/components/prompt";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { formatBytes } from "@/downloads/model";
import { useCan } from "@/lib/abilities";
import { haptics } from "@/lib/haptics";
import { locale, t } from "@/lib/i18n";
import { followUploadTasks } from "@/lib/upload-followup";
import {
	addPicked,
	batchProgress,
	outcomeFromResponse,
	patchEntry,
	reasonKey,
	sendable,
	summarize,
	type UploadEntry,
} from "@/lib/upload-queue";
import { useApi, useConnection } from "@/providers/app-provider";
import { EASE_OUT, motion, radius, space, usePalette } from "@/theme";
import { HardwareBack, SetupDone, SetupStep } from "./scaffold";

type Target = {
	uuid: string;
	name?: string | null;
	paths?: { id: number; path: string; isEnabled?: boolean | null }[] | null;
};

/**
 * The web's upload modal as a guided page: where the books go, the files
 * picked from the phone (each with its own progress and, if it didn't make
 * it, why), one button to send them all, then a done beat.
 */
export function UploadBooks({ libraryUuid }: { libraryUuid?: string }) {
	const { orpc } = useApi();
	const can = useCan();
	const targets = useQuery({
		...orpc.libraries.getUploadTargets.queryOptions(),
		staleTime: 0,
	});

	if (targets.isPending)
		return (
			<SetupStep leading="close" title={t("mobile.setup.upload_title")}>
				<Spinner />
			</SetupStep>
		);
	const libraries = (targets.data ?? []) as Target[];
	if (libraries.length === 0) {
		const canCreate = can("library", "create");
		return (
			<SetupStep
				leading="close"
				title={t("mobile.setup.upload_none_title")}
				lead={
					canCreate
						? t("mobile.setup.upload_none_lead")
						: t("mobile.setup.upload_none_member")
				}
				footer={
					canCreate ? (
						<Button
							label={t("mobile.setup.checklist_library")}
							onPress={() => router.replace("/setup/library")}
						/>
					) : null
				}
			/>
		);
	}
	return <Uploader libraries={libraries} initialUuid={libraryUuid} />;
}

function Uploader({
	libraries,
	initialUuid,
}: {
	libraries: Target[];
	initialUuid?: string;
}) {
	const { orpc, client } = useApi();
	const { serverUrl, auth } = useConnection();
	const queryClient = useQueryClient();
	const [libraryUuid, setLibraryUuid] = useState(
		libraries.some((library) => library.uuid === initialUuid)
			? initialUuid
			: libraries[0]?.uuid,
	);
	const library =
		libraries.find((item) => item.uuid === libraryUuid) ?? libraries[0];
	const folders = (library?.paths ?? []).filter((p) => p.isEnabled !== false);
	const [folderId, setFolderId] = useState<number | null>(null);
	const folder = folders.find((p) => p.id === folderId) ?? folders[0];

	const [entries, setEntries] = useState<UploadEntry[]>([]);
	const files = useRef(new Map<string, File>());
	const abort = useRef<AbortController | null>(null);
	const [current, setCurrent] = useState(0);

	const upload = useMutation({
		mutationFn: async (batch: UploadEntry[]) => {
			const taskIds: string[] = [];
			if (!library || !folder) return taskIds;
			const cookie = await auth.getCookie();
			const controller = new AbortController();
			abort.current = controller;
			for (const [index, entry] of batch.entries()) {
				if (controller.signal.aborted) break;
				const file = files.current.get(entry.id);
				if (!file) continue;
				setCurrent(index + 1);
				setEntries((list) =>
					patchEntry(list, entry.id, { status: "uploading", progress: 0 }),
				);
				const query = new URLSearchParams({
					libraryPathId: String(folder.id),
					filename: entry.name,
				});
				try {
					const response = await file.upload(
						`${serverUrl}/api/libraries/${library.uuid}/upload?${query}`,
						{
							httpMethod: "POST",
							uploadType: UploadType.BINARY_CONTENT,
							headers: {
								"Content-Type": "application/octet-stream",
								...(cookie ? { Cookie: cookie } : {}),
							},
							signal: controller.signal,
							onProgress: ({ bytesSent, totalBytes }) => {
								const total = totalBytes > 0 ? totalBytes : entry.size;
								const progress = total > 0 ? bytesSent / total : 0;
								// All bytes up: the server is hashing and moving it.
								setEntries((list) =>
									patchEntry(list, entry.id, {
										status: progress >= 1 ? "processing" : "uploading",
										progress: Math.min(1, progress),
									}),
								);
							},
						},
					);
					const outcome = outcomeFromResponse(response);
					if (outcome.taskId) taskIds.push(outcome.taskId);
					setEntries((list) =>
						patchEntry(list, entry.id, { ...outcome, progress: 1 }),
					);
				} catch {
					// Cancelled files go back to the queue; anything else can be retried.
					setEntries((list) =>
						patchEntry(
							list,
							entry.id,
							controller.signal.aborted
								? { status: "queued", progress: 0 }
								: { status: "failed", reason: "request_failed", progress: 0 },
						),
					);
				}
			}
			return taskIds;
		},
		onSuccess: (taskIds) => {
			if (taskIds.length === 0) return;
			// The books show up once the worker has read them, not as "Untitled".
			void followUploadTasks({
				taskIds,
				getStatus: async (taskId) =>
					(await client.tasks.getTask({ taskId }))?.status ?? null,
				onSettled: () => {
					void queryClient.invalidateQueries({ queryKey: orpc.books.key() });
					void queryClient.invalidateQueries({
						queryKey: orpc.libraries.key(),
					});
				},
			});
		},
		onSettled: () => {
			abort.current = null;
			setCurrent(0);
		},
	});

	const busy = upload.isPending;
	const queued = sendable(entries);
	const summary = summarize(entries);
	const attempted = entries.filter((entry) => entry.status !== "queued");
	const batchIds = new Set((upload.variables ?? []).map((entry) => entry.id));
	const batch = entries.filter((entry) => batchIds.has(entry.id));
	// A clean run gets the done beat; anything that didn't make it stays
	// listed with its reason.
	const finished =
		upload.isSuccess &&
		summary.uploaded > 0 &&
		summary.problems === 0 &&
		summary.pending === 0;

	const pick = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				multiple: true,
				// Android reads the picked document in place; copying a 2 GB book
				// into the cache first would double the wait.
				copyToCacheDirectory: process.env.EXPO_OS === "ios",
			});
			if (result.canceled) return;
			// The picker knows the real file name; a content:// URI doesn't.
			const picked = result.assets.map((asset) => {
				const file = new File(asset.uri);
				const size = asset.size ?? file.size;
				files.current.set(`${asset.name}:${size}`, file);
				return { uri: asset.uri, name: asset.name, size };
			});
			setEntries((list) => addPicked(list, picked));
			haptics.select();
		} catch {
			showNotice(t("library.upload_failed"));
		}
	};

	const chooseDestination = async () => {
		if (libraries.length > 1) {
			const picked = await askChoice({
				title: t("mobile.setup.upload_pick_library"),
				options: libraries.map((item) => ({
					id: item.uuid,
					label: item.name ?? t("library.untitled"),
					selected: item.uuid === library?.uuid,
				})),
			});
			if (!picked) return;
			setLibraryUuid(picked);
			setFolderId(null);
			const next = libraries.find((item) => item.uuid === picked);
			const nextFolders = (next?.paths ?? []).filter(
				(p) => p.isEnabled !== false,
			);
			if (nextFolders.length > 1) await chooseFolder(nextFolders);
			return;
		}
		await chooseFolder(folders);
	};
	const chooseFolder = async (options: { id: number; path: string }[]) => {
		const picked = await askChoice({
			title: t("mobile.setup.upload_pick_folder"),
			options: options.map((item) => ({
				id: String(item.id),
				label: item.path,
				selected: item.id === folder?.id,
			})),
		});
		if (picked) setFolderId(Number(picked));
	};

	const reset = () => {
		files.current.clear();
		setEntries([]);
		upload.reset();
	};

	if (finished) {
		return (
			<SetupDone
				title={t("mobile.setup.upload_done_title")}
				lead={`${t("library.upload_success", { count: summary.uploaded })}. ${t("mobile.setup.upload_done_lead")}`}
				footer={
					<>
						<Button
							label={t("mobile.setup.upload_done_view")}
							onPress={() => {
								router.back();
								if (library)
									router.push({
										pathname: "/library/[uuid]",
										params: {
											uuid: library.uuid,
											name: library.name ?? undefined,
										},
									});
							}}
						/>
						<Button
							variant="secondary"
							label={t("mobile.setup.upload_pick_more")}
							onPress={reset}
						/>
					</>
				}
			/>
		);
	}

	const canChange = !busy && (libraries.length > 1 || folders.length > 1);
	// After a run with problems: the list is the report, so close it from here.
	const settledReport =
		!busy && upload.isSuccess && queued.length === 0 && attempted.length > 0;

	return (
		<SetupStep
			leading={busy ? "none" : "close"}
			title={t("mobile.setup.upload_title")}
			lead={t("mobile.setup.upload_lead")}
			footer={
				busy ? (
					<>
						<View style={{ gap: space.sm, paddingBottom: space.xs }}>
							<Text
								variant="subhead"
								tone="secondary"
								accessibilityLiveRegion="polite"
								style={{ fontVariant: ["tabular-nums"] }}
							>
								{t("mobile.setup.upload_progress", {
									current,
									total: batch.length,
								})}
							</Text>
							<ProgressBar value={batchProgress(batch) * 100} height={4} />
						</View>
						<Button
							variant="secondary"
							label={t("library.upload_cancel_transfer")}
							onPress={() => abort.current?.abort()}
						/>
					</>
				) : settledReport ? (
					<>
						<Text variant="subhead" tone="secondary">
							{t("library.upload_summary_result", {
								uploaded: summary.uploaded,
								problems: summary.problems,
							})}
						</Text>
						<Button
							label={t("mobile.setup.done")}
							onPress={() => router.back()}
						/>
					</>
				) : (
					<Button
						label={
							queued.length > 0
								? t("library.upload_action_count", { count: queued.length })
								: t("library.upload_action")
						}
						disabled={queued.length === 0 || !folder}
						onPress={() => upload.mutate(queued)}
					/>
				)
			}
		>
			{/* Nothing may close the page mid-transfer: the upload lives here. */}
			{busy ? <HardwareBack onBack={() => {}} /> : null}
			<Destination
				library={library?.name ?? t("library.untitled")}
				folder={folders.length > 1 ? folder?.path : undefined}
				onChange={canChange ? chooseDestination : undefined}
			/>
			{entries.length === 0 ? (
				<PickZone onPress={pick} />
			) : (
				<View style={{ gap: space.sm }}>
					{entries.map((entry) => (
						<FileRow
							key={entry.id}
							entry={entry}
							onRemove={
								busy
									? undefined
									: () => {
											files.current.delete(entry.id);
											setEntries((list) =>
												list.filter((item) => item.id !== entry.id),
											);
										}
							}
						/>
					))}
					{busy ? null : (
						<Button
							variant="outline"
							icon={<AddIcon />}
							label={t("mobile.setup.upload_pick_more")}
							onPress={pick}
						/>
					)}
				</View>
			)}
		</SetupStep>
	);
}

function AddIcon() {
	const palette = usePalette();
	return <Icon name={icons.plus} size={18} color={palette.text} />;
}

function Destination({
	library,
	folder,
	onChange,
}: {
	library: string;
	folder?: string;
	onChange?: () => void;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<Icon name={icons.shelf} size={22} color={palette.textSecondary} />
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="caption" tone="secondary">
					{t("mobile.setup.upload_to")}
				</Text>
				<Text variant="listTitle" numberOfLines={1}>
					{library}
				</Text>
				{folder ? (
					<Text variant="caption" tone="secondary" numberOfLines={1}>
						{folder}
					</Text>
				) : null}
			</View>
			{onChange ? (
				<Pressable onPress={onChange} hitSlop={12} accessibilityRole="button">
					<Text variant="label" tone="accent">
						{t("mobile.setup.upload_change")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

/** The web's dashed drop zone, as the one big thing to tap. */
function PickZone({ onPress }: { onPress: () => void }) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t("mobile.setup.upload_pick")}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				alignItems: "center",
				gap: space.md,
				paddingVertical: 40,
				paddingHorizontal: space.xl,
				borderRadius: radius.card,
				borderCurve: "continuous",
				borderWidth: 1.5,
				borderStyle: "dashed",
				borderColor: palette.separator,
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surfaceCard
						: "transparent",
			})}
		>
			<View
				style={{
					width: 56,
					height: 56,
					borderRadius: radius.pill,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.accentSoft,
				}}
			>
				<Icon name={icons.upload} size={26} color={palette.accent} />
			</View>
			<Text variant="listTitle">{t("mobile.setup.upload_pick")}</Text>
			<Text variant="caption" tone="secondary" style={{ textAlign: "center" }}>
				{t("library.upload_formats")}
			</Text>
		</Pressable>
	);
}

function FileRow({
	entry,
	onRemove,
}: {
	entry: UploadEntry;
	onRemove?: () => void;
}) {
	const palette = usePalette();
	const key = entry.status === "uploaded" ? null : reasonKey(entry.reason);
	const reason = key
		? t(key, {
				limit: formatBytes(MAX_UPLOAD_BYTES, locale),
			})
		: null;
	const live = entry.status === "uploading" || entry.status === "processing";
	return (
		<Animated.View
			entering={FadeIn.duration(motion.fast).easing(EASE_OUT)}
			layout={LinearTransition.duration(motion.fast)}
			style={{
				gap: space.sm,
				paddingVertical: space.md,
				paddingLeft: space.lg,
				paddingRight: onRemove ? space.xs : space.lg,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
			>
				<StatusGlyph status={entry.status} />
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant="body" numberOfLines={1}>
						{entry.name}
					</Text>
					<Text
						variant="caption"
						tone={entry.status === "failed" ? "danger" : "secondary"}
						numberOfLines={1}
					>
						{reason ?? formatBytes(entry.size, locale)}
					</Text>
				</View>
				{onRemove && entry.status !== "uploaded" ? (
					<Pressable
						onPress={onRemove}
						accessibilityRole="button"
						accessibilityLabel={t("mobile.setup.upload_remove", {
							name: entry.name,
						})}
						hitSlop={4}
						style={{
							width: 44,
							height: 44,
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Icon
							name={icons.dismiss}
							size={16}
							color={palette.textSecondary}
						/>
					</Pressable>
				) : null}
			</View>
			{live ? <ProgressBar value={entry.progress * 100} height={3} /> : null}
		</Animated.View>
	);
}

function StatusGlyph({ status }: { status: UploadEntry["status"] }) {
	const palette = usePalette();
	if (status === "uploading" || status === "processing")
		return <Spinner inline tone="accent" />;
	const [icon, color] =
		status === "uploaded"
			? [icons.checkCircle, palette.accent]
			: status === "skipped"
				? [icons.warning, palette.textSecondary]
				: status === "failed"
					? [icons.warning, palette.danger]
					: [icons.book, palette.textTertiary];
	return <Icon name={icon} size={20} color={color} />;
}
