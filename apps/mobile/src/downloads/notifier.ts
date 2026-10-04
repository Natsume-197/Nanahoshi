import * as SecureStore from "expo-secure-store";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { locale, t } from "@/lib/i18n";
import { downloadNotification } from "../../modules/download-notification";
import { readEntry } from "./files";
import type { DownloadManager } from "./manager";
import type { DownloadReason } from "./model";
import { type Batch, EMPTY_BATCH, formatSize, stepBatch } from "./notify-model";

const ASKED_KEY = "nanahoshi.notifications-asked";
/** Progress lands at 1% steps; the shade needs far fewer. Throttled by
 * timestamp, not setTimeout: React Native's timers ride the display's frames
 * and stall while the app is in the background, which is when this matters. */
const UPDATE_EVERY_MS = 700;

const isManual = (reasons: DownloadReason[] | null) =>
	!reasons || reasons.some((reason) => reason.type === "manual");

function smartLabel(reasons: DownloadReason[], audio: boolean): string {
	const reason = reasons[0];
	switch (reason?.type) {
		case "collection":
			return reason.name;
		case "series":
			return t("mobile.smart.origin_series");
		case "reading":
			return t(
				audio ? "mobile.smart.origin_listening" : "mobile.smart.origin_reading",
			);
		default:
			return t(
				audio
					? "mobile.smart.origin_want_listen"
					: "mobile.smart.origin_want_read",
			);
	}
}

/**
 * Mirrors the download queue in an Android notification, which also keeps
 * the process alive while downloads run in the background. Returns the
 * cleanup for useMountEffect.
 */
export function connectDownloadNotification(
	manager: DownloadManager,
	onCancelAll: () => void,
) {
	// A previous JS session (reload, crash) may have left one up.
	downloadNotification.hide();
	downloadNotification.configure(
		t("mobile.notify.channel_progress"),
		t("mobile.notify.channel_ready"),
	);
	let batch: Batch = EMPTY_BATCH;
	let lastShown = 0;
	// Titles leave the queue before the notification names them.
	const titles = new Map<string, string>();

	const titleOf = (uuid: string) => {
		const cached = titles.get(uuid);
		if (cached) return cached;
		const job = manager.getSnapshot().jobs[uuid];
		const title = job ? readEntry(job.kind, job.serverId, uuid)?.title : null;
		if (title) titles.set(uuid, title);
		return title ?? "";
	};

	const render = () => {
		const jobs = manager.getSnapshot().jobs;
		for (const uuid of Object.keys(jobs)) titleOf(uuid);
		const result = stepBatch(batch, jobs, {
			completed: (uuid, job) =>
				Boolean(readEntry(job.kind, job.serverId, uuid)?.complete),
			manual: (uuid) => isManual(manager.pendingReasons(uuid)),
		});
		batch = result.batch;
		const view = result.view;
		if (!view) return;
		if (view.type === "progress") {
			askOnce();
			const job = jobs[view.uuid];
			const reasons = manager.pendingReasons(view.uuid);
			const amount = view.size
				? t("mobile.notify.size", {
						done: formatSize(view.size.done, locale),
						total: formatSize(view.size.total, locale),
					})
				: `${Math.round(view.progress * 100)} %`;
			downloadNotification.show({
				title: titleOf(view.uuid) || t("mobile.notify.downloading"),
				text:
					view.queued > 0
						? `${amount} · ${t("mobile.notify.queued", { count: view.queued })}`
						: amount,
				subText:
					reasons && !isManual(reasons)
						? `${t("mobile.smart.title")} · ${smartLabel(
								reasons,
								job?.kind === "audiobook",
							)}`
						: null,
				progress: view.progress > 0 ? view.progress : -1,
				cancelLabel: t("common.cancel"),
			});
			return;
		}
		if (view.type === "hide") {
			downloadNotification.hide();
			titles.clear();
			return;
		}
		const { done, failed, quiet } = view;
		const failedText =
			failed.length === 1
				? t("mobile.notify.failed_one", { title: titleOf(failed[0]) })
				: t("mobile.notify.failed_many", { count: failed.length });
		downloadNotification.done({
			title:
				done.length === 0
					? t("mobile.notify.failed_title")
					: done.length === 1
						? titleOf(done[0])
						: t("mobile.notify.ready_many", { count: done.length }),
			text:
				failed.length > 0
					? failedText
					: t(
							done.length === 1
								? "mobile.notify.ready_one"
								: "mobile.notify.ready_desc",
						),
			link: "nanahoshi://downloads",
			// A failure needs the user even when smart downloads hit it.
			quiet: quiet && failed.length === 0,
			retryLabel: failed.length > 0 ? t("common.retry") : null,
		});
		titles.clear();
	};

	let lastJobs = manager.getSnapshot().jobs;
	const unsubscribe = manager.subscribe(() => {
		const jobs = manager.getSnapshot().jobs;
		const progressOnly =
			Object.keys(jobs).length === Object.keys(lastJobs).length &&
			Object.entries(jobs).every(
				([uuid, job]) => lastJobs[uuid]?.status === job.status,
			);
		lastJobs = jobs;
		// Starts, ends and failures show at once; progress at most this often.
		if (progressOnly && Date.now() - lastShown < UPDATE_EVERY_MS) return;
		lastShown = Date.now();
		render();
	});
	const stopCancel = downloadNotification.onCancel(() => {
		onCancelAll();
		manager.cancelAll();
	});
	const stopRetry = downloadNotification.onRetry(() => manager.retryFailed());
	return () => {
		unsubscribe();
		stopCancel();
		stopRetry();
		downloadNotification.hide();
	};
}

/** Android 13+ asks before an app may notify; once, while it's on screen. */
function askOnce() {
	if (Platform.OS !== "android" || Platform.Version < 33) return;
	if (AppState.currentState !== "active") return;
	if (SecureStore.getItem(ASKED_KEY)) return;
	void SecureStore.setItemAsync(ASKED_KEY, "1");
	void PermissionsAndroid.request(
		PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
	).catch(() => undefined);
}
