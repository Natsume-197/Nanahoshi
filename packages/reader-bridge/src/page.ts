import type { ClientContext, ClientLink, ClientOptions } from "@orpc/client";
import { decodeRpcError, decodeRpcPayload, encodeRpcPayload } from "./codec";
import type {
	HostToReaderMessage,
	ReaderAudioState,
	ReaderInsets,
	ReaderToHostMessage,
} from "./protocol";

type ReadListenCommand = Extract<
	HostToReaderMessage,
	{ type: "read-listen-command" }
>["command"];

type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
};

export interface ReaderPageBridge {
	send(message: ReaderToHostMessage): void;
	receive(message: HostToReaderMessage): void;
	call(
		path: readonly string[],
		input: unknown,
		signal?: AbortSignal,
	): Promise<unknown>;
	onInsets(listener: (insets: ReaderInsets) => void): () => void;
	onVisibility(listener: (state: "visible" | "hidden") => void): () => void;
	onAudioState(listener: (state: ReaderAudioState) => void): () => void;
	onReadListenCommand(
		listener: (command: ReadListenCommand) => void,
	): () => void;
}

/** Page end of the bridge: numbered RPC requests answered by the host. */
export function createReaderPageBridge(
	post: (serialized: string) => void,
): ReaderPageBridge {
	let nextId = 1;
	const pending = new Map<number, Pending>();
	const insetListeners = new Set<(insets: ReaderInsets) => void>();
	const visibilityListeners = new Set<(state: "visible" | "hidden") => void>();
	const audioListeners = new Set<(state: ReaderAudioState) => void>();
	const commandListeners = new Set<(command: ReadListenCommand) => void>();

	const send = (message: ReaderToHostMessage) => post(JSON.stringify(message));

	return {
		send,
		receive(message) {
			switch (message.type) {
				case "rpc-result": {
					const request = pending.get(message.id);
					if (!request) return;
					pending.delete(message.id);
					if (message.ok) request.resolve(decodeRpcPayload(message.payload));
					else request.reject(decodeRpcError(message.error));
					return;
				}
				case "insets":
					for (const listener of insetListeners) listener(message.insets);
					return;
				case "visibility":
					for (const listener of visibilityListeners) listener(message.state);
					return;
				case "audio-state":
					for (const listener of audioListeners) listener(message.state);
					return;
				case "read-listen-command":
					for (const listener of commandListeners) listener(message.command);
					return;
			}
		},
		call(path, input, signal) {
			signal?.throwIfAborted();
			const id = nextId++;
			return new Promise((resolve, reject) => {
				// The host keeps working after an abort; only the caller stops waiting.
				const abort = () => {
					pending.delete(id);
					reject(signal?.reason);
				};
				signal?.addEventListener("abort", abort, { once: true });
				pending.set(id, {
					resolve: (value) => {
						signal?.removeEventListener("abort", abort);
						resolve(value);
					},
					reject: (error) => {
						signal?.removeEventListener("abort", abort);
						reject(error);
					},
				});
				send({
					type: "rpc",
					id,
					path: [...path],
					payload: encodeRpcPayload(input),
				});
			});
		},
		onInsets(listener) {
			insetListeners.add(listener);
			return () => insetListeners.delete(listener);
		},
		onVisibility(listener) {
			visibilityListeners.add(listener);
			return () => visibilityListeners.delete(listener);
		},
		onAudioState(listener) {
			audioListeners.add(listener);
			return () => audioListeners.delete(listener);
		},
		onReadListenCommand(listener) {
			commandListeners.add(listener);
			return () => commandListeners.delete(listener);
		},
	};
}

/** oRPC link that runs every procedure through the host's authenticated client. */
export class ReaderBridgeLink<T extends ClientContext>
	implements ClientLink<T>
{
	constructor(private readonly bridge: ReaderPageBridge) {}

	call(path: readonly string[], input: unknown, options: ClientOptions<T>) {
		return this.bridge.call(path, input, options.signal);
	}
}
