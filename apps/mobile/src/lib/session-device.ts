export type SessionDevice = {
	/** Browser name, "Nanahoshi" for this app, or null when unknown. */
	client: string | null;
	os: string | null;
	mobile: boolean;
};

/** What a sign-in session's user agent says about where it lives. Phones are
 * checked before desktops: iPhone agents mention "Mac OS X", Android ones
 * "Linux". */
export function describeSessionDevice(
	userAgent: string | null | undefined,
): SessionDevice {
	const ua = userAgent ?? "";
	// This app's own requests: React Native's HTTP stacks, not a browser.
	if (/^okhttp\//i.test(ua)) {
		return { client: "Nanahoshi", os: "Android", mobile: true };
	}
	if (/CFNetwork|Darwin/.test(ua) && !/Mozilla/.test(ua)) {
		return { client: "Nanahoshi", os: "iOS", mobile: true };
	}

	let client: string | null = null;
	if (ua.includes("Firefox")) client = "Firefox";
	else if (ua.includes("Edg")) client = "Edge";
	else if (ua.includes("Chrome")) client = "Chrome";
	else if (ua.includes("Safari")) client = "Safari";

	let os: string | null = null;
	if (/iPhone|iPad/.test(ua)) os = "iOS";
	else if (ua.includes("Android")) os = "Android";
	else if (ua.includes("Windows")) os = "Windows";
	else if (ua.includes("Mac")) os = "macOS";
	else if (ua.includes("Linux")) os = "Linux";

	return { client, os, mobile: /mobile|android|iphone|ipad/i.test(ua) };
}
