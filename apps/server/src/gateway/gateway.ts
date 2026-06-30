import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { presenceModule } from "./presence.module";
import { tasksModule } from "./tasks.module";
import type {
	GatewayConnection,
	GatewayConnectionHandler,
	GatewayModule,
} from "./types";

// Bun's WS handler (shared with the server entry, which passes it to Bun.serve).
export { websocket };

// Registered features. Add a module here to expose a new real-time namespace
// (e.g. chat) over the same socket — no new transport, auth, or reconnect code.
const modules: GatewayModule[] = [presenceModule, tasksModule];

// One multiplexed WebSocket per client. Every message is a JSON envelope
// `{ ns, data }`; the gateway fans inbound messages out to the owning module and
// runs a single per-connection keepalive tick that also drives module.onTick.
const TICK_MS = 30_000;

export function mountGateway(app: Hono) {
	app.get(
		"/ws",
		upgradeWebSocket(async (c) => {
			const session = await auth.api.getSession({ headers: c.req.raw.headers });
			if (!session?.user) {
				return { onOpen: (_evt, ws) => ws.close(1008, "Unauthorized") };
			}

			const userId = session.user.id;
			const serverId = session.session.activeOrganizationId ?? "";
			const role = session.user.role ?? null;
			const connId = crypto.randomUUID();

			// ns → this connection's handler. The gateway owns it, so a closed
			// socket drops every module's per-connection state at once.
			const handlers = new Map<string, GatewayConnectionHandler>();
			let closed = false;
			let tickTimer: ReturnType<typeof setInterval> | null = null;

			return {
				onOpen: (_evt, ws) => {
					const conn: GatewayConnection = {
						userId,
						serverId,
						role,
						connId,
						send: (ns, data) => {
							if (ws.readyState === 1) ws.send(JSON.stringify({ ns, data }));
						},
						close: () => ws.close(),
					};
					for (const m of modules) {
						Promise.resolve(m.connect(conn))
							.then((handler) => {
								// Socket closed before connect resolved — tear down now.
								if (closed) handler.onClose?.();
								else handlers.set(m.ns, handler);
							})
							.catch(() => {});
					}
					tickTimer = setInterval(() => {
						// App-level keepalive (survives proxy idle timeouts) + module ticks.
						conn.send("ping", null);
						for (const h of handlers.values()) {
							if (h.onTick) Promise.resolve(h.onTick()).catch(() => {});
						}
					}, TICK_MS);
				},
				onMessage: (evt) => {
					if (typeof evt.data !== "string") return;
					try {
						const msg = JSON.parse(evt.data) as { ns?: string; data?: unknown };
						if (msg.ns) handlers.get(msg.ns)?.onMessage?.(msg.data);
					} catch {}
				},
				onClose: () => {
					closed = true;
					if (tickTimer) clearInterval(tickTimer);
					for (const h of handlers.values()) h.onClose?.();
					handlers.clear();
				},
			};
		}),
	);
}
