import { env } from "@nanahoshi-v2/env/web";

// One multiplexed WebSocket for the whole app. Features subscribe by namespace
// (`presence` today, `chat` later) over this single connection. Unlike the
// browser's EventSource, a WebSocket has no built-in reconnect, so this manager
// owns reconnection (exponential backoff) and ref-counted lifecycle.

type Handler = (data: unknown) => void;

interface Subscription {
	ns: string;
	onMessage: Handler;
	onOpen?: () => void;
}

const subscriptions = new Set<Subscription>();
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
let desired = false; // whether we currently want a connection

// Keep the socket alive briefly after the last subscriber leaves, so route
// navigation (e.g. dashboard → reader, which unmounts then remounts presence)
// doesn't churn the connection.
const LINGER_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

function gatewayUrl(): string {
	return `${env.VITE_SERVER_URL.replace(/^http/, "ws")}/ws`;
}

function dispatch(ns: string, data: unknown): void {
	for (const sub of subscriptions) {
		if (sub.ns === ns) sub.onMessage(data);
	}
}

function connect(): void {
	if (
		ws &&
		(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
	) {
		return;
	}
	const socket = new WebSocket(gatewayUrl());
	ws = socket;

	socket.onopen = () => {
		reconnectAttempts = 0;
		for (const sub of subscriptions) sub.onOpen?.();
	};

	socket.onmessage = (event) => {
		try {
			const { ns, data } = JSON.parse(event.data) as {
				ns: string;
				data: unknown;
			};
			if (ns === "ping") return; // keepalive
			dispatch(ns, data);
		} catch {
			// ignore malformed frames
		}
	};

	socket.onclose = () => {
		if (ws === socket) ws = null;
		if (desired) scheduleReconnect();
	};

	socket.onerror = () => {
		socket.close();
	};
}

function scheduleReconnect(): void {
	if (reconnectTimer) return;
	const backoff = Math.min(2 ** reconnectAttempts * 1000, MAX_BACKOFF_MS);
	reconnectAttempts++;
	// Jitter avoids a reconnect stampede when the server restarts.
	reconnectTimer = setTimeout(
		() => {
			reconnectTimer = null;
			if (desired) connect();
		},
		backoff + Math.random() * 1000,
	);
}

function teardown(): void {
	desired = false;
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	reconnectAttempts = 0;
	ws?.close();
	ws = null;
}

/**
 * Subscribe to a gateway namespace. Opens the shared socket on the first
 * subscriber and closes it (after a short linger) when the last one leaves.
 * Returns an unsubscribe function.
 */
export function gatewaySubscribe(
	ns: string,
	onMessage: Handler,
	options?: { onOpen?: () => void },
): () => void {
	const sub: Subscription = { ns, onMessage, onOpen: options?.onOpen };
	subscriptions.add(sub);

	if (lingerTimer) {
		clearTimeout(lingerTimer);
		lingerTimer = null;
	}
	desired = true;
	connect();
	// Already connected? Fire onOpen so the new subscriber gets its initial sync.
	if (ws?.readyState === WebSocket.OPEN) sub.onOpen?.();

	return () => {
		subscriptions.delete(sub);
		if (subscriptions.size === 0 && !lingerTimer) {
			lingerTimer = setTimeout(() => {
				lingerTimer = null;
				if (subscriptions.size === 0) teardown();
			}, LINGER_MS);
		}
	};
}
