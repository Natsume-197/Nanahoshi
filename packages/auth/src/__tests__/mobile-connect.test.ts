import { describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { mobileConnect } from "../mobile-connect";

const BASE = "http://localhost:7331";

function makeAuth() {
	return betterAuth({
		baseURL: BASE,
		secret: "test-secret-test-secret-test-secret-123",
		database: memoryAdapter({
			user: [],
			session: [],
			account: [],
			verification: [],
		}),
		emailAndPassword: { enabled: true },
		rateLimit: { enabled: false },
		plugins: [mobileConnect()],
	});
}

type Auth = ReturnType<typeof makeAuth>;

function call(auth: Auth, path: string, body?: unknown, cookie?: string) {
	return auth.handler(
		new Request(`${BASE}/api/auth${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				"content-type": "application/json",
				origin: BASE,
				...(cookie ? { cookie } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
}

const sessionCookie = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(";")[0])
		.join("; ");

async function signedIn(auth: Auth) {
	const response = await call(auth, "/sign-up/email", {
		email: "reader@example.com",
		password: "a-long-password",
		name: "Reader",
	});
	return sessionCookie(response);
}

describe("mobile connect", () => {
	test("a phone trades the code for a session of its own, once", async () => {
		const auth = makeAuth();
		const browser = await signedIn(auth);

		const created = await call(auth, "/mobile-connect/create", {}, browser);
		expect(created.status).toBe(200);
		const { token } = (await created.json()) as { token: string };

		const pending = await call(
			auth,
			"/mobile-connect/status",
			{ token },
			browser,
		);
		expect(await pending.json()).toEqual({ status: "pending" });

		const redeemed = await call(auth, "/mobile-connect/redeem", { token });
		expect(redeemed.status).toBe(200);
		const phone = sessionCookie(redeemed);
		expect(phone).toContain("session_token=");
		expect(phone).not.toBe(browser);

		const phoneSession = await call(auth, "/get-session", undefined, phone);
		const session = (await phoneSession.json()) as {
			user: { email: string };
		};
		expect(session.user.email).toBe("reader@example.com");

		const paired = await call(
			auth,
			"/mobile-connect/status",
			{ token },
			browser,
		);
		expect(await paired.json()).toEqual({ status: "paired" });

		const again = await call(auth, "/mobile-connect/redeem", { token });
		expect(again.status).toBe(400);
		expect(((await again.json()) as { message: string }).message).toBe(
			"PAIRING_EXPIRED",
		);
	});

	test("signing out in the browser leaves the phone signed in", async () => {
		const auth = makeAuth();
		const browser = await signedIn(auth);
		const created = await call(auth, "/mobile-connect/create", {}, browser);
		const { token } = (await created.json()) as { token: string };
		const phone = sessionCookie(
			await call(auth, "/mobile-connect/redeem", { token }),
		);

		await call(auth, "/sign-out", {}, browser);
		const phoneSession = await call(auth, "/get-session", undefined, phone);
		expect(await phoneSession.json()).not.toBeNull();
	});

	test("only a signed-in browser can make a code", async () => {
		const auth = makeAuth();
		const response = await call(auth, "/mobile-connect/create", {});
		expect(response.status).toBe(401);
	});
});
