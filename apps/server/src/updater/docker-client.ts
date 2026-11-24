// The handful of Docker Engine API calls the updater makes, over the local
// socket. Unversioned paths let the engine answer with its own API version;
// every field used here has been stable since API 1.41.

export interface ContainerInspect {
	Id: string;
	Name: string;
	Image: string;
	/** Times the restart policy restarted it. */
	RestartCount?: number;
	State: {
		Status: string;
		Running: boolean;
		ExitCode?: number;
		Health?: { Status: string };
	};
	Config: ContainerConfig;
	HostConfig: Record<string, unknown> & { NetworkMode?: string };
	NetworkSettings: {
		Networks?: Record<string, EndpointSettings>;
	};
}

export interface ContainerConfig {
	Hostname?: string;
	Image: string;
	Env?: string[] | null;
	Labels?: Record<string, string> | null;
	Cmd?: string[] | null;
	Entrypoint?: string[] | null;
	WorkingDir?: string;
	User?: string;
	ExposedPorts?: Record<string, unknown> | null;
	Volumes?: Record<string, unknown> | null;
	Healthcheck?: unknown;
	StopSignal?: string;
	Shell?: string[] | null;
	[key: string]: unknown;
}

export interface EndpointSettings {
	Aliases?: string[] | null;
	IPAMConfig?: unknown;
	Links?: string[] | null;
	DriverOpts?: Record<string, string> | null;
	NetworkID?: string;
	IPAddress?: string;
	[key: string]: unknown;
}

export interface ImageInspect {
	Id: string;
	Config: Partial<ContainerConfig>;
}

export interface ContainerSummary {
	Id: string;
	Names: string[];
	Labels: Record<string, string>;
	State: string;
}

export interface PullProgress {
	completedBytes: number;
	totalBytes: number;
}

export interface DockerClient {
	inspectContainer(id: string): Promise<ContainerInspect | null>;
	listContainers(labels: string[]): Promise<ContainerSummary[]>;
	inspectImage(reference: string): Promise<ImageInspect | null>;
	pullImage(
		reference: string,
		onProgress: (progress: PullProgress) => void,
	): Promise<void>;
	stopContainer(id: string, timeoutSeconds: number): Promise<void>;
	startContainer(id: string): Promise<void>;
	renameContainer(id: string, name: string): Promise<void>;
	createContainer(name: string, body: unknown): Promise<string>;
	removeContainer(id: string): Promise<void>;
	connectNetwork(
		network: string,
		container: string,
		endpoint: unknown,
	): Promise<void>;
	removeImage(id: string): Promise<void>;
}

export class DockerApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "DockerApiError";
	}
}

export function createSocketDockerClient(socketPath: string): DockerClient {
	async function call(
		method: string,
		path: string,
		body?: unknown,
	): Promise<Response> {
		const response = await fetch(`http://docker${path}`, {
			method,
			// Bun's fetch speaks HTTP over a Unix socket with this option.
			unix: socketPath,
			headers: body === undefined ? {} : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		} as RequestInit);
		if (!response.ok && response.status !== 304) {
			let message = `${method} ${path} answered ${response.status}`;
			try {
				const payload = (await response.json()) as { message?: string };
				if (payload.message) message = payload.message;
			} catch {}
			throw new DockerApiError(response.status, message);
		}
		return response;
	}

	async function json<T>(method: string, path: string, body?: unknown) {
		return (await (await call(method, path, body)).json()) as T;
	}

	async function orNull<T>(promise: Promise<T>): Promise<T | null> {
		try {
			return await promise;
		} catch (error) {
			if (error instanceof DockerApiError && error.status === 404) return null;
			throw error;
		}
	}

	return {
		inspectContainer: (id) =>
			orNull(
				json<ContainerInspect>(
					"GET",
					`/containers/${encodeURIComponent(id)}/json`,
				),
			),
		listContainers: (labels) =>
			json<ContainerSummary[]>(
				"GET",
				`/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ label: labels }))}`,
			),
		inspectImage: (reference) =>
			orNull(
				json<ImageInspect>(
					"GET",
					`/images/${encodeURIComponent(reference)}/json`,
				),
			),
		async pullImage(reference, onProgress) {
			const response = await call(
				"POST",
				`/images/create?fromImage=${encodeURIComponent(reference)}`,
			);
			const layers = new Map<string, PullProgress>();
			const reader = response.body?.getReader();
			if (!reader) return;
			const decoder = new TextDecoder();
			let buffered = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffered += decoder.decode(value, { stream: true });
				const lines = buffered.split("\n");
				buffered = lines.pop() ?? "";
				for (const line of lines) {
					if (!line.trim()) continue;
					const event = JSON.parse(line) as {
						id?: string;
						error?: string;
						progressDetail?: { current?: number; total?: number };
					};
					if (event.error) throw new DockerApiError(500, event.error);
					const detail = event.progressDetail;
					if (event.id && detail?.total) {
						layers.set(event.id, {
							completedBytes: detail.current ?? 0,
							totalBytes: detail.total,
						});
						let completedBytes = 0;
						let totalBytes = 0;
						for (const layer of layers.values()) {
							completedBytes += layer.completedBytes;
							totalBytes += layer.totalBytes;
						}
						onProgress({ completedBytes, totalBytes });
					}
				}
			}
		},
		async stopContainer(id, timeoutSeconds) {
			await call(
				"POST",
				`/containers/${encodeURIComponent(id)}/stop?t=${timeoutSeconds}`,
			);
		},
		async startContainer(id) {
			await call("POST", `/containers/${encodeURIComponent(id)}/start`);
		},
		async renameContainer(id, name) {
			await call(
				"POST",
				`/containers/${encodeURIComponent(id)}/rename?name=${encodeURIComponent(name)}`,
			);
		},
		async createContainer(name, body) {
			const created = await json<{ Id: string }>(
				"POST",
				`/containers/create?name=${encodeURIComponent(name)}`,
				body,
			);
			return created.Id;
		},
		async removeContainer(id) {
			await call("DELETE", `/containers/${encodeURIComponent(id)}?force=true`);
		},
		async connectNetwork(network, container, endpoint) {
			await call("POST", `/networks/${encodeURIComponent(network)}/connect`, {
				Container: container,
				EndpointConfig: endpoint,
			});
		},
		async removeImage(id) {
			await call("DELETE", `/images/${encodeURIComponent(id)}`);
		},
	};
}
