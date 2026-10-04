import { ORPCError } from "@orpc/client";
import { decodeRpcPayload, encodeRpcError, encodeRpcPayload } from "./codec";
import type { HostToReaderMessage, ReaderToHostMessage } from "./protocol";

/** A procedure the host answers itself instead of forwarding, e.g. `files.getReaderUrl`. */
export type ReaderRpcOverride = (input: unknown) => Promise<unknown>;

export interface ReaderHostOptions {
	/** The host's oRPC client (any nested object of procedures). */
	client: object;
	overrides?: Record<string, ReaderRpcOverride>;
	deliver: (message: HostToReaderMessage) => void;
	/** Every message that is not an RPC. */
	onMessage: (message: Exclude<ReaderToHostMessage, { type: "rpc" }>) => void;
}

function resolveProcedure(client: object, path: readonly string[]) {
	let target: unknown = client;
	for (const segment of path) {
		// oRPC clients are proxies: every property read yields a callable.
		if (
			target === null ||
			(typeof target !== "object" && typeof target !== "function")
		)
			return undefined;
		target = (target as Record<string, unknown>)[segment];
	}
	return typeof target === "function"
		? (target as (input: unknown) => Promise<unknown>)
		: undefined;
}

/** Host end of the bridge: parses one raw page message and answers RPCs. */
export function createReaderHost({
	client,
	overrides = {},
	deliver,
	onMessage,
}: ReaderHostOptions) {
	const answer = async (id: number, path: string[], input: unknown) => {
		try {
			const procedure =
				overrides[path.join(".")] ?? resolveProcedure(client, path);
			if (!procedure) {
				throw new ORPCError("NOT_FOUND", {
					message: `Unknown procedure ${path.join(".")}`,
				});
			}
			const result = await procedure(input);
			deliver({
				type: "rpc-result",
				id,
				ok: true,
				payload: encodeRpcPayload(result),
			});
		} catch (error) {
			deliver({
				type: "rpc-result",
				id,
				ok: false,
				error: encodeRpcError(error),
			});
		}
	};

	return {
		handle(raw: string) {
			let message: ReaderToHostMessage;
			try {
				message = JSON.parse(raw) as ReaderToHostMessage;
			} catch {
				return;
			}
			if (message.type === "rpc") {
				void answer(
					message.id,
					message.path,
					decodeRpcPayload(message.payload),
				);
				return;
			}
			onMessage(message);
		},
	};
}
