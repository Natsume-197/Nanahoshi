import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ContainerInspect,
	ContainerSummary,
	DockerClient,
	ImageInspect,
} from "../docker-client";
import { createBody, ownConfig } from "../recreate";
import { type HealthAnswer, Updater } from "../updater";

const REF = "ghcr.io/natsume-197/nanahoshi:latest";

function image(id: string, version: string): ImageInspect {
	return {
		Id: id,
		Config: {
			Env: [`NANAHOSHI_RELEASE=${version}`, "PATH=/usr/bin"],
			Labels: { "org.opencontainers.image.version": version },
			Entrypoint: ["/usr/local/bin/nanahoshi-entrypoint"],
			ExposedPorts: { "3000/tcp": {} },
			Healthcheck: { Test: ["CMD", "/usr/local/bin/nanahoshi-healthcheck"] },
		},
	};
}

function container(
	id: string,
	imageId: string,
	name: string,
	version: string,
	reference = REF,
): ContainerInspect {
	return {
		Id: id,
		Name: `/${name}`,
		Image: imageId,
		State: { Status: "running", Running: true },
		Config: {
			Hostname: id.slice(0, 12),
			Image: reference,
			Env: [
				`NANAHOSHI_RELEASE=${version}`,
				"PATH=/usr/bin",
				"DB_HOST=postgres",
			],
			Labels: {
				"org.opencontainers.image.version": version,
				"com.docker.compose.project": "nanahoshi",
				"com.docker.compose.service": "server",
			},
			Entrypoint: ["/usr/local/bin/nanahoshi-entrypoint"],
			ExposedPorts: { "3000/tcp": {} },
			Healthcheck: { Test: ["CMD", "/usr/local/bin/nanahoshi-healthcheck"] },
		},
		HostConfig: { Binds: ["books:/books"], NetworkMode: "nanahoshi_default" },
		NetworkSettings: {
			Networks: {
				nanahoshi_default: {
					Aliases: ["server", id.slice(0, 12)],
					IPAddress: "172.18.0.5",
					NetworkID: "net1",
				},
			},
		},
	};
}

class FakeDocker implements DockerClient {
	containers = new Map<string, ContainerInspect>();
	images = new Map<string, ImageInspect>();
	/** What `pullImage` makes REF point at. */
	published: ImageInspect;
	created: { name: string; body: unknown }[] = [];
	removedImages: string[] = [];
	failStart = false;
	newState: ContainerInspect["State"] = { Status: "running", Running: true };
	nextId = 1;

	constructor(running: ImageInspect, published: ImageInspect) {
		this.images.set(running.Id, running);
		this.images.set(REF, running);
		this.published = published;
		const server = container(
			"old-container-id-000",
			running.Id,
			"nanahoshi-server-1",
			"v1.0.0",
		);
		this.containers.set(server.Id, server);
		const self = container(
			"updater-id-0000000",
			"x",
			"nanahoshi-updater-1",
			"v1.0.0",
		);
		this.containers.set(self.Id, self);
	}

	private find(idOrName: string) {
		for (const entry of this.containers.values()) {
			if (entry.Id === idOrName || entry.Name === `/${idOrName}`) return entry;
		}
		return null;
	}

	async inspectContainer(id: string) {
		return structuredClone(this.find(id));
	}
	async listContainers(labels: string[]): Promise<ContainerSummary[]> {
		return [...this.containers.values()]
			.filter((entry) =>
				labels.every((label) => {
					const [key, value] = label.split("=");
					return entry.Config.Labels?.[key as string] === value;
				}),
			)
			.filter((entry) => !entry.Name.includes("updater"))
			.map((entry) => ({
				Id: entry.Id,
				Names: [entry.Name],
				Labels: entry.Config.Labels ?? {},
				State: entry.State.Status,
			}));
	}
	async inspectImage(reference: string) {
		return structuredClone(this.images.get(reference) ?? null);
	}
	async pullImage(
		_reference: string,
		onProgress: (p: { completedBytes: number; totalBytes: number }) => void,
	) {
		onProgress({ completedBytes: 5, totalBytes: 10 });
		// Like the containerd image store: an image is forgotten once its tag moves.
		const previous = this.images.get(REF);
		if (previous && previous.Id !== this.published.Id)
			this.images.delete(previous.Id);
		this.images.set(this.published.Id, this.published);
		this.images.set(REF, this.published);
	}
	async stopContainer(id: string) {
		const entry = this.find(id);
		if (entry) entry.State = { Status: "exited", Running: false, ExitCode: 0 };
	}
	async startContainer(id: string) {
		const entry = this.find(id);
		if (!entry) throw new Error("no such container");
		if (
			this.failStart &&
			entry.Name !== "/nanahoshi-server-1-previous" &&
			!entry.Id.startsWith("old")
		) {
			throw new Error("port is already allocated");
		}
		entry.State = entry.Id.startsWith("new")
			? { ...this.newState }
			: { Status: "running", Running: true };
	}
	async renameContainer(id: string, name: string) {
		const entry = this.find(id);
		if (entry) entry.Name = `/${name}`;
	}
	async createContainer(name: string, body: unknown) {
		this.created.push({ name, body });
		const id = `new-container-${this.nextId++}`;
		const created = container(id, this.published.Id, name, "v1.1.0");
		created.State = { Status: "created", Running: false };
		this.containers.set(id, created);
		return id;
	}
	async removeContainer(id: string) {
		const entry = this.find(id);
		if (entry) this.containers.delete(entry.Id);
	}
	async connectNetwork() {}
	async removeImage(id: string) {
		this.removedImages.push(id);
	}
	names() {
		return [...this.containers.values()].map((entry) => entry.Name).sort();
	}
}

let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "nanahoshi-updater-"));
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function makeUpdater(
	docker: FakeDocker,
	health: HealthAnswer = { kind: "ok" },
) {
	let clock = Date.parse("2026-11-24T12:00:00Z");
	return new Updater({
		docker,
		directory,
		service: "server",
		selfId: "updater-id-0000000",
		version: "v1.0.0",
		owner: { uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 },
		checkHealth: async () => health,
		verifyTimeoutMs: 30_000,
		verifyIntervalMs: 1_000,
		stopTimeoutSeconds: 40,
		log: () => {},
		now: () => new Date(clock),
		sleep: async (ms) => {
			clock += ms;
		},
	});
}

async function readStatus() {
	return JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
}

describe("ownConfig", () => {
	test("drops what the old image set, keeps what the operator set", () => {
		const old = image("sha256:old", "v1.0.0");
		const config = ownConfig(
			container("abcdef1234567890", "sha256:old", "server", "v1.0.0"),
			old,
			REF,
		);
		expect(config.Env).toEqual(["DB_HOST=postgres"]);
		expect(config.Labels).toEqual({
			"com.docker.compose.project": "nanahoshi",
			"com.docker.compose.service": "server",
		});
		expect(config.Entrypoint).toBeUndefined();
		expect(config.Healthcheck).toBeUndefined();
		expect(config.ExposedPorts).toBeUndefined();
		expect(config.Hostname).toBeUndefined();
		expect(config.Image).toBe(REF);
	});

	test("without the old image, drops what the new image sets and OCI labels", () => {
		const config = ownConfig(
			container("abcdef1234567890", "sha256:gone", "server", "v1.0.0"),
			null,
			REF,
			image("sha256:new", "v1.1.0"),
		);
		expect(config.Env).toEqual(["DB_HOST=postgres"]);
		expect(config.Labels).toEqual({
			"com.docker.compose.project": "nanahoshi",
			"com.docker.compose.service": "server",
		});
	});

	test("keeps the networks but not the old container's ID alias", () => {
		const { body } = createBody(
			container("abcdef1234567890", "sha256:old", "server", "v1.0.0"),
			image("sha256:old", "v1.0.0"),
			REF,
		);
		expect(
			body.NetworkingConfig?.EndpointsConfig.nanahoshi_default?.Aliases,
		).toEqual(["server"]);
		expect(body.HostConfig).toEqual({
			Binds: ["books:/books"],
			NetworkMode: "nanahoshi_default",
		});
	});
});

describe("Updater", () => {
	test("finds the server by its Compose project and reports it", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker);
		await updater.start();
		const status = await readStatus();
		expect(status.problem).toBeNull();
		expect(status.target).toEqual({
			container: "nanahoshi-server-1",
			image: REF,
			pinned: false,
			runningVersion: "v1.0.0",
		});
	});

	test("takes only the request names, install before stage", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker);
		await updater.start();
		await writeFile(join(directory, "requests", "stage"), "");
		await writeFile(join(directory, "requests", "install"), "anything");
		expect(await updater.takeRequest()).toBe("install");
		expect(await updater.takeRequest()).toBeNull();
	});

	test("stage pulls and remembers the newer version", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker);
		await updater.start();
		await updater.stage();
		const status = await readStatus();
		expect(status.staged.version).toBe("v1.1.0");
		expect(status.lastOperation.result).toBe("ok");
		expect(docker.created).toHaveLength(0);
	});

	test("never moves back to an older image", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.2.0"),
			image("sha256:new", "v1.1.0"),
		);
		const server = docker.containers.get("old-container-id-000");
		if (server?.Config.Labels)
			server.Config.Labels["org.opencontainers.image.version"] = "v1.2.0";
		const updater = makeUpdater(docker);
		await updater.start();
		await updater.install();
		const status = await readStatus();
		expect(status.lastOperation.result).toBe("up-to-date");
		expect(docker.created).toHaveLength(0);
	});

	test("refuses a pinned image", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const server = docker.containers.get("old-container-id-000");
		if (server) server.Config.Image = "ghcr.io/natsume-197/nanahoshi:v1.0.0";
		const updater = makeUpdater(docker);
		await updater.start();
		await updater.install();
		const status = await readStatus();
		expect(status.target.pinned).toBe(true);
		expect(status.lastOperation.result).toBe("failed");
		expect(docker.created).toHaveLength(0);
	});

	test("install replaces the container and removes the previous one once healthy", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker);
		await updater.start();
		await updater.install();
		const status = await readStatus();
		expect(status.lastOperation).toMatchObject({
			action: "install",
			result: "ok",
			fromVersion: "v1.0.0",
			toVersion: "v1.1.0",
		});
		expect(docker.names()).toEqual([
			"/nanahoshi-server-1",
			"/nanahoshi-updater-1",
		]);
		expect(docker.created[0]?.name).toBe("nanahoshi-server-1");
		// The old image was forgotten by the pull; its remembered config still
		// keeps its release and labels off the new container.
		const body = docker.created[0]?.body as {
			Env: string[];
			Labels: Record<string, string>;
		};
		expect(body.Env).toEqual(["DB_HOST=postgres"]);
		expect(body.Labels["org.opencontainers.image.version"]).toBeUndefined();
		expect(docker.removedImages).toEqual(["sha256:old"]);
		expect(status.phase).toBe("idle");
	});

	test("puts the previous container back when the new one can't start", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		docker.failStart = true;
		const updater = makeUpdater(docker);
		await updater.start();
		await updater.install();
		const status = await readStatus();
		expect(status.lastOperation.result).toBe("failed");
		expect(status.lastOperation.message).toContain("previous one was put back");
		const server = await docker.inspectContainer("nanahoshi-server-1");
		expect(server?.Id).toBe("old-container-id-000");
		expect(server?.State.Running).toBe(true);
	});

	test("puts the previous container back when the backup before migrating failed", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker, {
			kind: "safe-mode",
			code: "backup-failed",
		});
		await updater.start();
		await updater.install();
		const server = await docker.inspectContainer("nanahoshi-server-1");
		expect(server?.Id).toBe("old-container-id-000");
		expect((await readStatus()).lastOperation.result).toBe("failed");
	});

	test("leaves a migrated server in safe mode and drops the previous container", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker, {
			kind: "safe-mode",
			code: "migration-failed",
		});
		await updater.start();
		await updater.install();
		expect(docker.names()).toEqual([
			"/nanahoshi-server-1",
			"/nanahoshi-updater-1",
		]);
		const status = await readStatus();
		expect(status.lastOperation.message).toContain(
			"safe mode (migration-failed)",
		);
	});

	test("keeps the previous container when the new one never answers", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const updater = makeUpdater(docker, { kind: "unreachable" });
		await updater.start();
		await updater.install();
		expect(docker.names()).toContain("/nanahoshi-server-1-previous");
		expect((await readStatus()).lastOperation.message).toContain(
			"hasn't answered",
		);
	});

	test("treats a container the restart policy keeps restarting as crashed", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		docker.newState = { Status: "restarting", Running: true, ExitCode: 3 };
		const updater = makeUpdater(docker, { kind: "unreachable" });
		await updater.start();
		await updater.install();
		const server = await docker.inspectContainer("nanahoshi-server-1");
		expect(server?.Id).toBe("old-container-id-000");
		expect((await readStatus()).lastOperation.message).toContain("exit code 3");
	});

	test("restores a lone previous container left by an interrupted install", async () => {
		const docker = new FakeDocker(
			image("sha256:old", "v1.0.0"),
			image("sha256:new", "v1.1.0"),
		);
		const server = docker.containers.get("old-container-id-000");
		if (server) {
			server.Name = "/nanahoshi-server-1-previous";
			server.State = { Status: "exited", Running: false };
		}
		const updater = makeUpdater(docker);
		await updater.start();
		const restored = await docker.inspectContainer("nanahoshi-server-1");
		expect(restored?.State.Running).toBe(true);
		expect((await readStatus()).target.container).toBe("nanahoshi-server-1");
	});
});
