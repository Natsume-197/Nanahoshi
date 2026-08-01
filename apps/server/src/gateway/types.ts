// A single authenticated WebSocket connection, as seen by gateway modules. The
// transport (Bun WS) is hidden behind `send`/`close` so modules never touch the
// raw socket. Identity/claims live here (userId, serverId, role); a module
// derives whatever predicate it needs (e.g. tasks: role === "admin").
export interface GatewayConnection {
	readonly userId: string;
	readonly sessionId: string;
	/** Active server (better-auth organization); "" when none is selected. */
	readonly serverId: string;
	/** better-auth user role ("admin" for the app owner), or null. */
	readonly role: string | null;
	readonly connId: string;
	/** Push a namespaced message to this client: `{ ns, data }`. */
	send(ns: string, data: unknown): void;
	close(): void;
}

// Per-connection handler instance returned by a module's `connect`. It closes
// over whatever per-connection state it needs (subscriptions, timers), so the
// gateway owns the lifecycle and a closed socket drops it all — no module ever
// keeps its own connId-keyed map.
export interface GatewayConnectionHandler {
	/** Inbound client→server message for this module's namespace. */
	onMessage?(data: unknown): void;
	/** Periodic work driven by the gateway's shared keepalive tick. */
	onTick?(): void | Promise<void>;
	onClose?(): void;
}

// A feature plugged into the gateway (presence/tasks today, chat tomorrow). Each
// owns one namespace and builds a fresh handler per connection.
export interface GatewayModule {
	readonly ns: string;
	connect(
		conn: GatewayConnection,
	): GatewayConnectionHandler | Promise<GatewayConnectionHandler>;
}
