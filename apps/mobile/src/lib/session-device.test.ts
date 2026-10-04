import { describe, expect, it } from "bun:test";
import { describeSessionDevice } from "./session-device";

describe("describeSessionDevice", () => {
	it("recognizes this app on both platforms", () => {
		expect(describeSessionDevice("okhttp/4.12.0")).toEqual({
			client: "Nanahoshi",
			os: "Android",
			mobile: true,
		});
		expect(
			describeSessionDevice("Nanahoshi/1 CFNetwork/1568.100.1 Darwin/24.0.0"),
		).toEqual({ client: "Nanahoshi", os: "iOS", mobile: true });
	});

	it("does not mistake phones for the desktops their agents mention", () => {
		const iphone =
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
		const android =
			"Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
		expect(describeSessionDevice(iphone)).toEqual({
			client: "Safari",
			os: "iOS",
			mobile: true,
		});
		expect(describeSessionDevice(android)).toEqual({
			client: "Chrome",
			os: "Android",
			mobile: true,
		});
	});

	it("reads desktop browsers and gives up on nothing", () => {
		expect(
			describeSessionDevice(
				"Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
			),
		).toEqual({ client: "Firefox", os: "Linux", mobile: false });
		expect(describeSessionDevice(null)).toEqual({
			client: null,
			os: null,
			mobile: false,
		});
	});
});
