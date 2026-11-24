import { env } from "@nanahoshi/env/server";
import { BadRequestError, ConflictError } from "../../errors";
import { logger } from "../../lib/logger";
import { quietSince, readBusyReasons } from "../../modules/updates/idle";
import { installBlockFor } from "../../modules/updates/install-block";
import {
	fetchReleases,
	selectNewerReleases,
} from "../../modules/updates/release-feed";
import { publishUpdatesChanged } from "../../modules/updates/update.events";
import {
	readUpdaterConnection,
	type UpdaterConnection,
	writeUpdaterRequest,
} from "../../modules/updates/updater-link";
import {
	compareVersions,
	isNewerVersion,
	runningRelease,
} from "../../modules/updates/version";
import type {
	UpdateCheck,
	UpdateNotice,
	UpdatePreferences,
	UpdaterView,
	UpdateSchedule,
	UpdateStatus,
} from "./update.model";
import { updateRepository } from "./update.repository";

/** A failed background download is retried at most this often. */
const STAGE_RETRY_MS = 60 * 60_000;

function isDevelopment() {
	return runningRelease() === "development";
}

function updaterView(connection: UpdaterConnection): UpdaterView {
	if (connection.state === "absent") {
		return {
			state: "absent",
			problem: null,
			image: null,
			pinned: false,
			phase: "idle",
			progress: null,
			stagedVersion: null,
			lastOperation: null,
		};
	}
	const { status } = connection;
	return {
		state: connection.state,
		problem: status.problem,
		image: status.target?.image ?? null,
		pinned: status.target?.pinned ?? false,
		phase: connection.state === "connected" ? status.phase : "idle",
		progress: connection.state === "connected" ? status.progress : null,
		stagedVersion: status.staged?.version ?? null,
		lastOperation: status.lastOperation,
	};
}

/** The newest release, when it is newer than the one running. */
function availableRelease(check: UpdateCheck) {
	const latest = check.latest;
	if (!latest || isDevelopment()) return null;
	return isNewerVersion(latest.version, runningRelease()) ? latest : null;
}

async function readState() {
	const [check, preferences, schedule, connection] = await Promise.all([
		updateRepository.getCheck(),
		updateRepository.getPreferences(),
		updateRepository.getSchedule(),
		readUpdaterConnection(env.NANAHOSHI_UPDATER_DIR),
	]);
	const updater = updaterView(connection);
	const available = availableRelease(check);
	const installBlock = installBlockFor({
		release: runningRelease(),
		checkEnabled: env.NANAHOSHI_UPDATE_CHECK,
		updater,
		available: available !== null,
	});
	return { check, preferences, schedule, updater, available, installBlock };
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
	const [state, busy] = await Promise.all([readState(), readBusyReasons()]);
	return {
		release: runningRelease(),
		development: isDevelopment(),
		checkEnabled: env.NANAHOSHI_UPDATE_CHECK,
		repository: env.NANAHOSHI_RELEASE_REPOSITORY,
		check: state.check,
		preferences: state.preferences,
		schedule: state.schedule,
		updater: state.updater,
		available: state.available,
		installBlock: state.installBlock,
		busy,
	};
}

export async function getUpdateNotice(isAdmin: boolean): Promise<UpdateNotice> {
	const [schedule, check] = await Promise.all([
		updateRepository.getSchedule(),
		isAdmin ? updateRepository.getCheck() : null,
	]);
	return {
		release: runningRelease(),
		schedule: schedule
			? {
					mode: schedule.mode,
					requestedByName: schedule.requestedBy?.name ?? null,
					requestedAt: schedule.requestedAt,
					installing: schedule.sentAt !== null,
				}
			: null,
		available: check ? (availableRelease(check)?.version ?? null) : null,
	};
}

/** Read GitHub's releases now. Errors are kept on the check, not thrown. */
export async function checkForUpdates(): Promise<UpdateCheck> {
	const previous = await updateRepository.getCheck();
	if (!env.NANAHOSHI_UPDATE_CHECK || isDevelopment()) return previous;
	let check: UpdateCheck;
	try {
		const raw = await fetchReleases(env.NANAHOSHI_RELEASE_REPOSITORY);
		const { latest, newer } = selectNewerReleases(raw, runningRelease());
		check = {
			checkedAt: new Date().toISOString(),
			error: null,
			latest,
			newer,
		};
	} catch (err) {
		logger.warn({ err }, "Update check failed");
		check = {
			...previous,
			checkedAt: new Date().toISOString(),
			error: err instanceof Error ? err.message : "Update check failed",
		};
	}
	await updateRepository.saveCheck(check);
	publishUpdatesChanged();
	return check;
}

async function requireUpdater() {
	const connection = await readUpdaterConnection(env.NANAHOSHI_UPDATER_DIR);
	const updater = updaterView(connection);
	if (updater.state !== "connected" || updater.problem) {
		throw new BadRequestError(
			"The updater is not running. Add the updater service from docker-compose.yml, or update by pulling the new image.",
		);
	}
	if (updater.pinned) {
		throw new BadRequestError(
			"This server runs a pinned image version. Change the image tag to update it.",
		);
	}
	return updater;
}

export async function downloadUpdate() {
	const updater = await requireUpdater();
	if (updater.phase !== "idle") return { requested: false as const };
	await writeUpdaterRequest(env.NANAHOSHI_UPDATER_DIR, "stage");
	publishUpdatesChanged();
	return { requested: true as const };
}

async function sendInstall(schedule: UpdateSchedule) {
	await writeUpdaterRequest(env.NANAHOSHI_UPDATER_DIR, "install");
	await updateRepository.saveSchedule({
		...schedule,
		sentAt: new Date().toISOString(),
	});
	logger.info(
		{ mode: schedule.mode, targetVersion: schedule.targetVersion },
		"Update install requested",
	);
	publishUpdatesChanged();
}

export async function scheduleInstall(
	when: "now" | "idle",
	requestedBy: { id: string; name: string } | null,
) {
	const state = await readState();
	if (state.installBlock) {
		throw new BadRequestError(`Can't install now (${state.installBlock}).`);
	}
	if (state.schedule?.sentAt) {
		throw new ConflictError("An update is already being installed.");
	}
	const schedule: UpdateSchedule = {
		mode: when,
		requestedBy,
		requestedAt: new Date().toISOString(),
		targetVersion:
			state.available?.version ?? state.updater.stagedVersion ?? null,
		sentAt: null,
	};
	if (when === "now") {
		await sendInstall(schedule);
	} else {
		await updateRepository.saveSchedule(schedule);
		publishUpdatesChanged();
	}
	return getUpdateStatus();
}

export async function cancelInstall() {
	const schedule = await updateRepository.getSchedule();
	if (!schedule) return getUpdateStatus();
	if (schedule.sentAt) {
		throw new ConflictError(
			"The update has already started and can't be cancelled.",
		);
	}
	await updateRepository.saveSchedule(null);
	publishUpdatesChanged();
	return getUpdateStatus();
}

export async function setUpdatePreferences(change: Partial<UpdatePreferences>) {
	const preferences = {
		...(await updateRepository.getPreferences()),
		...change,
	};
	await updateRepository.savePreferences(preferences);
	// Turning automatic installs off withdraws the restart they planned.
	const schedule = await updateRepository.getSchedule();
	if (
		!preferences.autoInstall &&
		schedule &&
		schedule.requestedBy === null &&
		!schedule.sentAt
	) {
		await updateRepository.saveSchedule(null);
	}
	publishUpdatesChanged();
	return getUpdateStatus();
}

let lastSnapshot = "";

/**
 * One minute of update housekeeping, run by the worker: start a scheduled
 * install once nobody is busy, download and plan automatic updates, and drop
 * a schedule the updater has answered.
 */
export async function runUpdateTick(now = Date.now()) {
	const state = await readState();
	const { schedule, updater, preferences, available } = state;

	const snapshot = JSON.stringify([
		updater.state,
		updater.phase,
		updater.stagedVersion,
		updater.lastOperation?.finishedAt,
		updater.progress?.completedBytes,
	]);
	if (snapshot !== lastSnapshot) {
		lastSnapshot = snapshot;
		publishUpdatesChanged();
	}

	if (schedule?.sentAt) {
		// The updater answered without restarting us: it failed, or found
		// nothing newer. Either way the planned restart is over.
		const answer = updater.lastOperation;
		if (
			answer?.action === "install" &&
			answer.finishedAt &&
			Date.parse(answer.finishedAt) >= Date.parse(schedule.sentAt) &&
			answer.result !== "running"
		) {
			await updateRepository.saveSchedule(null);
			publishUpdatesChanged();
		}
		return;
	}

	if (schedule && !state.installBlock) {
		if (schedule.mode === "now") {
			await sendInstall(schedule);
			return;
		}
		const { quiet } = await quietSince(Date.parse(schedule.requestedAt), now);
		if (quiet) await sendInstall(schedule);
		return;
	}

	if (!available || updater.state !== "connected" || updater.pinned) return;
	if (updater.problem || updater.phase !== "idle") return;

	const staged =
		updater.stagedVersion !== null &&
		compareVersions(updater.stagedVersion, available.version) === 0;
	if (!staged && preferences.autoDownload) {
		const last = updater.lastOperation;
		const recentlyFailed =
			last?.action === "stage" &&
			last.result === "failed" &&
			last.finishedAt !== null &&
			now - Date.parse(last.finishedAt) < STAGE_RETRY_MS;
		if (!recentlyFailed) {
			await writeUpdaterRequest(env.NANAHOSHI_UPDATER_DIR, "stage");
			publishUpdatesChanged();
		}
		return;
	}
	if (staged && preferences.autoInstall && !schedule) {
		await updateRepository.saveSchedule({
			mode: "idle",
			requestedBy: null,
			requestedAt: new Date(now).toISOString(),
			targetVersion: available.version,
			sentAt: null,
		});
		publishUpdatesChanged();
	}
}

/**
 * Startup bookkeeping, under the startup lock after migrations: remember the
 * highest release this database ran, and close a schedule whose install is
 * what restarted us.
 */
export async function recordRunningRelease() {
	const schedule = await updateRepository.getSchedule();
	if (schedule?.sentAt) await updateRepository.saveSchedule(null);

	const release = runningRelease();
	if (release === "development") return;
	const stored = await updateRepository.getInstanceRelease();
	if (stored && !isNewerVersion(release, stored.release)) return;
	await updateRepository.saveInstanceRelease({
		release,
		previous: stored?.release ?? null,
		updatedAt: new Date().toISOString(),
	});
}
