import type { BetterAuthOptions } from "better-auth";

type AuthAdvancedOptions = NonNullable<BetterAuthOptions["advanced"]>;

/**
 * The HTTP server overwrites this header from the socket peer and only honors
 * forwarded addresses from configured trusted proxies. Better Auth must use
 * that sanitized value instead of the user-controlled forwarding headers.
 */
export const authIpAddress = {
	ipAddressHeaders: ["x-nanahoshi-client-ip"],
} satisfies AuthAdvancedOptions["ipAddress"];

export const authRateLimit = {
	enabled: true,
	window: 60,
	max: 100,
	customRules: {
		"/sign-in/email": { window: 60, max: 5 },
		"/sign-up/email": { window: 60, max: 5 },
		"/forget-password": { window: 60, max: 3 },
		"/reset-password": { window: 60, max: 5 },
		// These authenticated reads are polled during normal navigation. They do
		// not accept credentials, so brute-force protection does not apply. A high
		// finite budget still eventually locks out an active client because Better
		// Auth keeps its in-memory window alive while requests continue.
		"/get-session": false,
		"/organization/list": false,
		"/organization/get-full-organization": false,
	},
} satisfies NonNullable<BetterAuthOptions["rateLimit"]>;
