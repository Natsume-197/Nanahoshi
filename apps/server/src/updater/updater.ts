import {
	chown,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
	isFloatingReference,
	UPDATER_PROTOCOL,
	UPDATER_REQUESTS_DIR,
	UPDATER_STATUS_FILE,
	type UpdaterOperation,
	type UpdaterPhase,
	type UpdaterStatus,
	UpdaterStatusSchema,
} from "@nanahoshi/api/modules/updates/protocol";
import { compareVersions } from "@nanahoshi/api/modules/updates/version";
import type {
	ContainerInspect,
	DockerClient,
	ImageInspect,
} from "./docker-client";
import {
	containerName,
	hasCrashed,
	previousName,
	replaceContainer,
	restorePrevious,
	VERSION_LABEL,
	type Verdict,
} from "./recreate";

export type HealthAnswer =
	| { kind: "ok" }
	| { kind: "safe-mode"; code: string | null }
	| { kind: "unreachable" };

export interface UpdaterOptions {
	docker: DockerClient;
	directory: string;
	/** Container name or ID; otherwise found by Compose project and service. */
	target?: string;
	service: string;
	/** This container's own ID (its hostname), to find its Compose project. */
	selfId?: string;
	version: string;
	owner: { uid: number; gid: number };
	checkHealth: (address: string) => Promise<HealthAnswer>;
	verifyTimeoutMs: number;
	verifyIntervalMs: number;
	stopTimeoutSeconds: number;
	log: (message: string, extra?: Record<string, unknown>) => void;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
}

const COMPOSE_PROJECT = "com.docker.compose.project";
/** The running image's configuration, kept for after its tag moves. */
const IMAGE_CONFIG_FILE = "running-image.json";
const COMPOSE_SERVICE = "com.docker.compose.service";

function message(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export class Updater {
	private status: UpdaterStatus;
	private readonly now: () => Date;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(private readonly options: UpdaterOptions) {
		this.now = options.now ?? (() => new Date());
		this.sleep =
			options.sleep ??
			((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
		this.status = {
			protocol: UPDATER_PROTOCOL,
			updaterVersion: options.version,
			heartbeatAt: this.now().toISOString(),
			problem: null,
			target: null,
			staged: null,
			phase: "idle",
			progress: null,
			lastOperation: null,
		};
	}

	get current() {
		return this.status;
	}

	/** Prepare the shared folder, keep the last answer, and finish an interrupted install. */
	async start() {
		const requests = join(this.options.directory, UPDATER_REQUESTS_DIR);
		await mkdir(requests, { recursive: true, mode: 0o770 });
		// The server runs as PUID:PGID and must be able to leave requests here.
		await chown(requests, this.options.owner.uid, this.options.owner.gid).catch(
			() => {},
		);
		try {
			const previous = UpdaterStatusSchema.safeParse(
				JSON.parse(
					await readFile(
						join(this.options.directory, UPDATER_STATUS_FILE),
						"utf8",
					),
				),
			);
			if (previous.success) {
				this.status.lastOperation = previous.data.lastOperation;
				this.status.staged = previous.data.staged;
			}
		} catch {}
		let target = await this.refreshTarget();
		if (!target && this.options.target) {
			if (await this.recoverMissingTarget(this.options.target)) {
				target = await this.refreshTarget();
			}
		}
		if (target) await this.recover(target);
		await this.writeStatus();
	}

	/** Find the server container, and say what is wrong when it can't. */
	async refreshTarget(): Promise<ContainerInspect | null> {
		const { docker } = this.options;
		let container: ContainerInspect | null = null;
		try {
			if (this.options.target) {
				container = await docker.inspectContainer(this.options.target);
			} else if (this.options.selfId) {
				const self = await docker.inspectContainer(this.options.selfId);
				const project = self?.Config.Labels?.[COMPOSE_PROJECT];
				if (project) {
					const [match] = (
						await docker.listContainers([
							`${COMPOSE_PROJECT}=${project}`,
							`${COMPOSE_SERVICE}=${this.options.service}`,
						])
					).filter(
						(entry) => !entry.Names.some((n) => n.endsWith("-previous")),
					);
					if (match) {
						container = await docker.inspectContainer(match.Id);
					} else {
						container = await this.restoreLonePrevious(project);
					}
				}
			}
		} catch (error) {
			this.status.problem = `Docker didn't answer: ${message(error)}`;
			this.status.target = null;
			return null;
		}
		if (!container) {
			this.status.problem =
				"Couldn't find the Nanahoshi server container. Set NANAHOSHI_UPDATER_TARGET to its name.";
			this.status.target = null;
			return null;
		}
		const image = await this.runningImage(container);
		this.status.problem = null;
		this.status.target = {
			container: containerName(container),
			image: container.Config.Image,
			pinned: !isFloatingReference(container.Config.Image),
			runningVersion:
				container.Config.Labels?.[VERSION_LABEL] ??
				image?.Config.Labels?.[VERSION_LABEL] ??
				null,
		};
		return container;
	}

	/**
	 * The image the server runs, read from the engine while it can be and
	 * remembered on disk: the containerd image store forgets an image as soon
	 * as a pull moves its tag, even while a container still runs it, and the
	 * recreate needs its configuration to tell inherited settings from the
	 * operator's own.
	 */
	private async runningImage(
		container: ContainerInspect,
	): Promise<ImageInspect | null> {
		const file = join(this.options.directory, IMAGE_CONFIG_FILE);
		const live = await this.options.docker
			.inspectImage(container.Image)
			.catch(() => null);
		if (live) {
			await writeFile(file, JSON.stringify(live), { mode: 0o600 }).catch(
				() => {},
			);
			return live;
		}
		try {
			const kept = JSON.parse(await readFile(file, "utf8")) as ImageInspect;
			return kept.Id === container.Image ? kept : null;
		} catch {
			return null;
		}
	}

	/**
	 * An install the updater didn't see to the end (it was restarted part way)
	 * leaves `<name>-previous`. With no server container in its place, the
	 * previous one comes back; with one running, the install went through.
	 */
	private async recover(target: ContainerInspect) {
		const { docker } = this.options;
		const name = containerName(target);
		const previous = await docker.inspectContainer(previousName(name));
		if (!previous) return;
		if (hasCrashed(target)) {
			// The new release never ran; its database work hadn't started.
			this.options.log(
				"Restoring the server container from before a failed update",
			);
			await docker.removeContainer(target.Id).catch(() => {});
			await restorePrevious(docker, previous.Id, name);
			await this.refreshTarget();
			return;
		}
		const address = Object.values(target.NetworkSettings.Networks ?? {})
			.map((network) => network.IPAddress)
			.find((ip) => ip);
		const answer = address
			? await this.options.checkHealth(address)
			: target.State.Health?.Status === "healthy"
				? { kind: "ok" as const }
				: { kind: "unreachable" as const };
		if (answer.kind === "ok") {
			this.options.log("Removing the container left by an earlier update", {
				container: previousName(name),
			});
			await docker.removeContainer(previous.Id).catch(() => {});
		}
	}

	/** In a Compose project whose only server container is `-previous`, bring it back. */
	private async restoreLonePrevious(project: string) {
		const { docker } = this.options;
		const [previous] = (
			await docker.listContainers([
				`${COMPOSE_PROJECT}=${project}`,
				`${COMPOSE_SERVICE}=${this.options.service}`,
			])
		).filter((entry) => entry.Names.some((n) => n.endsWith("-previous")));
		if (!previous || previous.State === "running") return null;
		const name = (previous.Names[0] ?? "")
			.replace(/^\//, "")
			.replace(/-previous$/, "");
		if (!name) return null;
		this.options.log(
			"Restoring the server container from before an interrupted update",
		);
		await restorePrevious(docker, previous.Id, name);
		return docker.inspectContainer(previous.Id);
	}

	/** Restore a lost server container from `<name>-previous`, if that is all there is. */
	async recoverMissingTarget(name: string) {
		const { docker } = this.options;
		const previous = await docker.inspectContainer(previousName(name));
		if (!previous) return false;
		this.options.log(
			"Restoring the server container from before an interrupted update",
		);
		await restorePrevious(docker, previous.Id, name);
		return true;
	}

	async heartbeat() {
		await this.writeStatus();
	}

	/** Take the waiting requests, newest intent first: an install includes a stage. */
	async takeRequest(): Promise<"install" | "stage" | null> {
		const requests = join(this.options.directory, UPDATER_REQUESTS_DIR);
		let names: string[];
		try {
			names = await readdir(requests);
		} catch {
			return null;
		}
		const wanted = names.includes("install")
			? "install"
			: names.includes("stage")
				? "stage"
				: null;
		// Never read: only the file name is the request.
		for (const name of names) {
			if (name === "install" || name === "stage") {
				await rm(join(requests, name), { force: true });
			}
		}
		return wanted;
	}

	private setPhase(phase: UpdaterPhase) {
		this.status.phase = phase;
		if (phase !== "pulling") this.status.progress = null;
		void this.writeStatus();
	}

	private begin(action: "stage" | "install"): UpdaterOperation {
		const operation: UpdaterOperation = {
			action,
			startedAt: this.now().toISOString(),
			finishedAt: null,
			result: "running",
			message: null,
			fromVersion: this.status.target?.runningVersion ?? null,
			toVersion: null,
		};
		this.status.lastOperation = operation;
		return operation;
	}

	private async finish(
		operation: UpdaterOperation,
		result: UpdaterOperation["result"],
		text: string,
	) {
		operation.result = result;
		operation.message = text;
		operation.finishedAt = this.now().toISOString();
		this.status.phase = "idle";
		this.status.progress = null;
		this.options.log(text, { action: operation.action, result });
		await this.writeStatus();
	}

	/**
	 * Pull the reference the server runs. Returns the pulled image when it is a
	 * newer release than the running one, and null otherwise.
	 */
	private async pull(
		target: ContainerInspect,
		operation: UpdaterOperation,
	): Promise<{ id: string; version: string | null } | null> {
		const { docker } = this.options;
		const reference = target.Config.Image;
		this.setPhase("pulling");
		await docker.pullImage(reference, (progress) => {
			this.status.progress = progress;
		});
		const pulled = await docker.inspectImage(reference);
		if (!pulled) throw new Error(`The pulled image ${reference} isn't there.`);
		const version = pulled.Config.Labels?.[VERSION_LABEL] ?? null;
		operation.toVersion = version;
		if (pulled.Id === target.Image) {
			this.status.staged = null;
			return null;
		}
		const running = this.status.target?.runningVersion;
		if (version && running && (compareVersions(version, running) ?? 1) <= 0) {
			// A floating tag can move back (a withdrawn release). Never follow it.
			this.status.staged = null;
			return null;
		}
		this.status.staged = { version, pulledAt: this.now().toISOString() };
		return { id: pulled.Id, version };
	}

	private refusal(target: ContainerInspect | null) {
		if (!target)
			return this.status.problem ?? "The server container wasn't found.";
		if (this.status.target?.pinned) {
			return `The server runs the pinned image ${target.Config.Image}. Change its tag to update.`;
		}
		return null;
	}

	async stage() {
		const operation = this.begin("stage");
		const target = await this.refreshTarget();
		const refused = this.refusal(target);
		if (refused || !target)
			return this.finish(operation, "failed", refused ?? "");
		try {
			const pulled = await this.pull(target, operation);
			if (!pulled) {
				return this.finish(
					operation,
					"up-to-date",
					"No newer image is published yet.",
				);
			}
			return this.finish(
				operation,
				"ok",
				`Downloaded ${pulled.version ?? "the new image"}; it installs when you update.`,
			);
		} catch (error) {
			return this.finish(
				operation,
				"failed",
				`Download failed: ${message(error)}`,
			);
		}
	}

	async install() {
		const { docker } = this.options;
		const operation = this.begin("install");
		const target = await this.refreshTarget();
		const refused = this.refusal(target);
		if (refused || !target)
			return this.finish(operation, "failed", refused ?? "");

		const oldImage = await this.runningImage(target);
		let pulled: { id: string; version: string | null } | null;
		try {
			pulled = await this.pull(target, operation);
		} catch (error) {
			return this.finish(
				operation,
				"failed",
				`Download failed: ${message(error)}`,
			);
		}
		if (!pulled) {
			return this.finish(
				operation,
				"up-to-date",
				"No newer image is published yet. A release's image appears a few minutes after its announcement.",
			);
		}

		const name = containerName(target);
		let newId: string;
		try {
			newId = await replaceContainer({
				docker,
				container: target,
				reference: target.Config.Image,
				oldImage,
				newImage: await docker.inspectImage(target.Config.Image),
				stopTimeoutSeconds: this.options.stopTimeoutSeconds,
				onPhase: (phase) => this.setPhase(phase),
			});
		} catch (error) {
			return this.finish(
				operation,
				"failed",
				`The new release couldn't start, so the previous one was put back: ${message(error)}`,
			);
		}

		this.setPhase("verifying");
		const verdict = await this.verify(newId);
		const previous = await docker.inspectContainer(previousName(name));

		if (verdict.kind === "healthy") {
			if (previous) await docker.removeContainer(previous.Id).catch(() => {});
			// Only frees space; an image another container uses stays.
			await docker.removeImage(target.Image).catch(() => {});
			this.status.staged = null;
			await this.refreshTarget();
			return this.finish(
				operation,
				"ok",
				`Updated to ${pulled.version ?? "the new release"}.`,
			);
		}

		// These two stopped before touching the database, so the previous
		// release can take over again safely.
		const untouched =
			verdict.kind === "exited" ||
			(verdict.kind === "safe-mode" && verdict.code === "backup-failed");
		if (untouched && previous) {
			await docker.removeContainer(newId).catch(() => {});
			await restorePrevious(docker, previous.Id, name).catch((error) =>
				this.options.log("Couldn't restore the previous container", {
					error: message(error),
				}),
			);
			await this.refreshTarget();
			return this.finish(
				operation,
				"failed",
				verdict.kind === "exited"
					? `The new release stopped right after starting (exit code ${verdict.exitCode ?? "unknown"}), so the previous one was put back.`
					: "The backup before migrating failed, so the previous release was put back. Free disk space and try again.",
			);
		}

		if (verdict.kind === "safe-mode") {
			if (previous) await docker.removeContainer(previous.Id).catch(() => {});
			await this.refreshTarget();
			return this.finish(
				operation,
				"failed",
				`The new release started in safe mode (${verdict.code ?? "unknown"}). Its page says why; the container logs have the details.`,
			);
		}

		// Still starting after the wait (a long migration, say): leave it be,
		// and keep the previous container stopped for a manual return.
		await this.refreshTarget();
		return this.finish(
			operation,
			"failed",
			`The new release hasn't answered yet. It may still be migrating; the previous container is kept stopped as ${previousName(name)}.`,
		);
	}

	private async verify(containerId: string): Promise<Verdict> {
		const { docker } = this.options;
		const deadline = this.now().getTime() + this.options.verifyTimeoutMs;
		while (this.now().getTime() < deadline) {
			await this.sleep(this.options.verifyIntervalMs);
			const container = await docker
				.inspectContainer(containerId)
				.catch(() => null);
			if (!container) return { kind: "exited", exitCode: null };
			if (hasCrashed(container)) {
				return { kind: "exited", exitCode: container.State.ExitCode ?? null };
			}
			const address = Object.values(container.NetworkSettings.Networks ?? {})
				.map((network) => network.IPAddress)
				.find((ip) => ip);
			if (address) {
				const answer = await this.options.checkHealth(address);
				if (answer.kind === "ok") return { kind: "healthy" };
				if (answer.kind === "safe-mode") {
					return { kind: "safe-mode", code: answer.code };
				}
			} else if (container.State.Health?.Status === "healthy") {
				return { kind: "healthy" };
			}
		}
		return { kind: "timeout" };
	}

	private writing: Promise<void> = Promise.resolve();

	/** Writes run one at a time, each with the status as it is then, so an
	 * earlier snapshot never lands after a later one. */
	private writeStatus(): Promise<void> {
		const write = async () => {
			this.status.heartbeatAt = this.now().toISOString();
			const destination = join(this.options.directory, UPDATER_STATUS_FILE);
			const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
			await writeFile(temporary, JSON.stringify(this.status), { mode: 0o644 });
			await rename(temporary, destination);
		};
		this.writing = this.writing.then(write, write);
		return this.writing;
	}
}
