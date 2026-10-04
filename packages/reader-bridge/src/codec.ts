import { ORPCError } from "@orpc/client";
import {
	StandardRPCJsonSerializer,
	StandardRPCSerializer,
} from "@orpc/client/standard";
import type { RpcPayload } from "./protocol";

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer());

/** oRPC's own wire encoding, so Dates, Maps, BigInts and undefined survive JSON. */
export function encodeRpcPayload(data: unknown): RpcPayload {
	const encoded = serializer.serialize(data);
	if (encoded instanceof FormData) {
		throw new Error("Binary oRPC payloads cannot cross the reader bridge");
	}
	return encoded;
}

export function decodeRpcPayload(payload: RpcPayload): unknown {
	return serializer.deserialize(payload);
}

export function encodeRpcError(error: unknown) {
	// Shape check, not instanceof: the host may bundle its own @orpc/client copy.
	if (
		error instanceof Error &&
		"code" in error &&
		"status" in error &&
		typeof (error as ORPCError<string, unknown>).toJSON === "function"
	)
		return (error as ORPCError<string, unknown>).toJSON();
	// The host never reached the server (offline, DNS, TLS): not a server fault.
	return new ORPCError("SERVICE_UNAVAILABLE", {
		message: error instanceof Error ? error.message : String(error),
	}).toJSON();
}

export function decodeRpcError(
	json: ReturnType<typeof encodeRpcError>,
): ORPCError<string, unknown> {
	return new ORPCError(json.code, {
		status: json.status,
		message: json.message,
		data: json.data,
		defined: json.defined,
	});
}
