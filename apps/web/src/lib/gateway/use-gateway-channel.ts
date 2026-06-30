import { useMountEffect } from "@/hooks/use-mount-effect";
import { gatewaySubscribe } from "./gateway-client";

/**
 * Subscribe to a gateway namespace for the lifetime of the component. Wraps the
 * `gatewaySubscribe` + `useMountEffect` cleanup wiring so feature hooks stay
 * declarative.
 */
export function useGatewayChannel(
	ns: string,
	onMessage: (data: unknown) => void,
	onOpen?: () => void,
) {
	useMountEffect(() =>
		gatewaySubscribe(ns, onMessage, onOpen ? { onOpen } : undefined),
	);
}
