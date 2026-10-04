import { AppState } from "react-native";

// The web's gateway socket (apps/web/src/lib/gateway). The server counts a
// member as online only while one is open, so reading or listening on the phone
// shows up for the rest of the server. Closed in the background, like a tab.
const MAX_BACKOFF_MS = 30_000;

export function keepGatewayOpen({
	serverUrl,
	getCookie,
}: {
	serverUrl: string;
	getCookie: () => string | null | Promise<string | null>;
}) {
	let socket: WebSocket | null = null;
	let attempts = 0;
	let retry: ReturnType<typeof setTimeout> | null = null;
	let wanted = false;
	let connecting = false;

	const connect = async () => {
		if (!wanted || socket || connecting) return;
		connecting = true;
		const cookie = await Promise.resolve(getCookie()).finally(() => {
			connecting = false;
		});
		if (!wanted || socket) return;
		// React Native's WebSocket accepts headers; the session cookie authorizes.
		const WebSocketWithHeaders = WebSocket as unknown as new (
			url: string,
			protocols: undefined,
			options: { headers: Record<string, string> },
		) => WebSocket;
		const current = new WebSocketWithHeaders(
			`${serverUrl.replace(/^http/, "ws")}/ws`,
			undefined,
			{ headers: cookie ? { Cookie: cookie } : {} },
		);
		socket = current;
		current.onopen = () => {
			attempts = 0;
		};
		current.onerror = () => current.close();
		current.onclose = () => {
			if (socket === current) socket = null;
			if (!wanted || retry) return;
			const backoff = Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS);
			attempts++;
			retry = setTimeout(
				() => {
					retry = null;
					void connect();
				},
				backoff + Math.random() * 1000,
			);
		};
	};

	const disconnect = () => {
		wanted = false;
		if (retry) clearTimeout(retry);
		retry = null;
		attempts = 0;
		socket?.close();
		socket = null;
	};

	const follow = (state: string) => {
		if (state === "active") {
			wanted = true;
			void connect();
		} else {
			disconnect();
		}
	};
	follow(AppState.currentState);
	const subscription = AppState.addEventListener("change", follow);
	return () => {
		subscription.remove();
		disconnect();
	};
}
