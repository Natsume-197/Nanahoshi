import type {
	ContainerConfig,
	ContainerInspect,
	DockerClient,
	EndpointSettings,
	ImageInspect,
} from "./docker-client";

export const VERSION_LABEL = "org.opencontainers.image.version";

function sameValue(a: unknown, b: unknown) {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The baseline to subtract when the old image can't be read any more (the
 * containerd image store forgets an image once its tag moves): the keys the
 * new image sets for itself, and every OCI image label.
 */
function fallbackBase(
	container: ContainerInspect,
	newImage: ImageInspect | null,
): Partial<ContainerConfig> {
	const newKeys = new Set(
		(newImage?.Config.Env ?? []).map((entry) => entry.split("=")[0]),
	);
	return {
		Env: (container.Config.Env ?? []).filter((entry) =>
			newKeys.has(entry.split("=")[0]),
		),
		Labels: Object.fromEntries(
			Object.entries(container.Config.Labels ?? {}).filter(([key]) =>
				key.startsWith("org.opencontainers.image."),
			),
		),
	};
}

/**
 * The container's own configuration, without what it inherited from its
 * image. `docker inspect` merges the two, so recreating from it verbatim would
 * pin the old image's environment (its NANAHOSHI_RELEASE, its PATH), labels,
 * command and health check onto the new image. Only what the operator set
 * (Compose's environment, labels, command...) is kept.
 */
export function ownConfig(
	container: ContainerInspect,
	oldImage: ImageInspect | null,
	reference: string,
	newImage: ImageInspect | null = null,
): ContainerConfig {
	const base = oldImage?.Config ?? fallbackBase(container, newImage);
	const config: ContainerConfig = { ...container.Config, Image: reference };

	const imageEnv = new Set(base.Env ?? []);
	config.Env = (container.Config.Env ?? []).filter(
		(entry) => !imageEnv.has(entry),
	);

	const imageLabels = base.Labels ?? {};
	config.Labels = Object.fromEntries(
		Object.entries(container.Config.Labels ?? {}).filter(
			([key, value]) => imageLabels[key] !== value,
		),
	);

	for (const key of [
		"Cmd",
		"Entrypoint",
		"WorkingDir",
		"User",
		"Healthcheck",
		"StopSignal",
		"Shell",
	] as const) {
		if (key in base && sameValue(config[key], base[key])) delete config[key];
	}
	for (const key of ["ExposedPorts", "Volumes"] as const) {
		const own = { ...(config[key] ?? {}) };
		for (const inherited of Object.keys(base[key] ?? {})) delete own[inherited];
		if (Object.keys(own).length > 0) config[key] = own;
		else delete config[key];
	}
	// Docker names a container's host after its ID unless told otherwise.
	if (config.Hostname && container.Id.startsWith(config.Hostname)) {
		delete config.Hostname;
	}
	return config;
}

/** How to attach the new container to each network the old one was on. */
export function endpointsFor(container: ContainerInspect) {
	const mode = container.HostConfig.NetworkMode ?? "";
	if (mode === "host" || mode === "none" || mode.startsWith("container:")) {
		return [];
	}
	return Object.entries(container.NetworkSettings.Networks ?? {}).map(
		([name, endpoint]: [string, EndpointSettings]) => ({
			name,
			config: {
				Aliases: (endpoint.Aliases ?? []).filter(
					(alias) => !container.Id.startsWith(alias),
				),
				IPAMConfig: endpoint.IPAMConfig ?? undefined,
				Links: endpoint.Links ?? undefined,
				DriverOpts: endpoint.DriverOpts ?? undefined,
			},
		}),
	);
}

export function createBody(
	container: ContainerInspect,
	image: ImageInspect | null,
	reference: string,
	newImage: ImageInspect | null = null,
) {
	const endpoints = endpointsFor(container);
	const [first] = endpoints;
	return {
		body: {
			...ownConfig(container, image, reference, newImage),
			HostConfig: container.HostConfig,
			NetworkingConfig: first
				? { EndpointsConfig: { [first.name]: first.config } }
				: undefined,
		},
		// The create call takes one network on older engines; the rest connect after.
		extraNetworks: endpoints.slice(1),
	};
}

/**
 * The container stopped, or the restart policy is bringing it back again and
 * again: with `restart: unless-stopped` a crashing container reads as
 * "restarting", never "exited".
 */
export function hasCrashed(container: ContainerInspect) {
	const { State } = container;
	if (State.Status === "restarting" || (container.RestartCount ?? 0) > 0) {
		return true;
	}
	return (
		!State.Running && (State.Status === "exited" || State.Status === "dead")
	);
}

export function containerName(container: ContainerInspect) {
	return container.Name.replace(/^\//, "");
}

export function previousName(name: string) {
	return `${name}-previous`;
}

export type Verdict =
	| { kind: "healthy" }
	| { kind: "safe-mode"; code: string | null }
	| { kind: "exited"; exitCode: number | null }
	| { kind: "timeout" };

/**
 * Stop the running container, start one from `reference` in its place, and
 * keep the old one stopped beside it as `<name>-previous` until `verify` says
 * how the new one went. If the new one can't even be created or started, the
 * old one comes straight back.
 */
export async function replaceContainer(input: {
	docker: DockerClient;
	container: ContainerInspect;
	reference: string;
	/** Read before the pull: the old image may be gone once its tag moved. */
	oldImage: ImageInspect | null;
	newImage: ImageInspect | null;
	stopTimeoutSeconds: number;
	onPhase: (phase: "stopping" | "recreating") => void;
}) {
	const { docker, container, reference } = input;
	const name = containerName(container);
	const { body, extraNetworks } = createBody(
		container,
		input.oldImage,
		reference,
		input.newImage,
	);

	input.onPhase("stopping");
	await docker.stopContainer(container.Id, input.stopTimeoutSeconds);
	await docker.renameContainer(container.Id, previousName(name));

	input.onPhase("recreating");
	let createdId: string | null = null;
	try {
		createdId = await docker.createContainer(name, body);
		for (const network of extraNetworks) {
			await docker.connectNetwork(network.name, createdId, network.config);
		}
		await docker.startContainer(createdId);
		return createdId;
	} catch (error) {
		if (createdId) await docker.removeContainer(createdId).catch(() => {});
		await restorePrevious(docker, container.Id, name);
		throw error;
	}
}

/** Put the stopped previous container back under its own name and start it. */
export async function restorePrevious(
	docker: DockerClient,
	previousId: string,
	name: string,
) {
	await docker.renameContainer(previousId, name);
	await docker.startContainer(previousId);
}
