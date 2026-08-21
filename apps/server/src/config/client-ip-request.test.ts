import { describe, expect, test } from "bun:test";
import { prepareClientIpRequest } from "./client-ip-request";

describe("prepareClientIpRequest", () => {
	test("preserves the original request object for WebSocket upgrades", () => {
		const request = new Request("http://localhost/ws", {
			headers: {
				connection: "Upgrade",
				upgrade: "websocket",
				"x-forwarded-for": "203.0.113.10",
			},
		});

		expect(
			prepareClientIpRequest(request, "172.18.0.1", new Set(["172.18.0.1"])),
		).toBe(request);
	});

	test("clones normal HTTP requests with a trusted forwarded client IP", () => {
		const request = new Request("http://localhost/rpc", {
			headers: {
				"x-forwarded-for": "203.0.113.10, 172.18.0.1",
				"x-nanahoshi-client-ip": "spoofed",
			},
		});

		const prepared = prepareClientIpRequest(
			request,
			"172.18.0.1",
			new Set(["172.18.0.1"]),
		);

		expect(prepared).not.toBe(request);
		expect(prepared.headers.get("x-nanahoshi-client-ip")).toBe("203.0.113.10");
	});

	test("ignores forwarded IPs from untrusted peers", () => {
		const request = new Request("http://localhost/rpc", {
			headers: { "x-forwarded-for": "203.0.113.10" },
		});

		const prepared = prepareClientIpRequest(
			request,
			"198.51.100.2",
			new Set(["172.18.0.1"]),
		);

		expect(prepared.headers.get("x-nanahoshi-client-ip")).toBe("198.51.100.2");
	});
});
