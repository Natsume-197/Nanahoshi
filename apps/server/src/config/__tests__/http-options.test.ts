import { expect, test } from "bun:test";
import { MAX_UPLOAD_REQUEST_BYTES } from "@nanahoshi/api/modules/scanning/supportedExtensions";
import { withHttpRequestLimits } from "../http-options";

test("lets an allowed upload through Bun and outlast its default 10s idle cut", () => {
	const fetch = () => new Response("ok");
	const options = withHttpRequestLimits({ fetch });

	expect(options.fetch).toBe(fetch);
	expect(options.maxRequestBodySize).toBe(MAX_UPLOAD_REQUEST_BYTES);
	expect(options.idleTimeout).toBeGreaterThan(10);
});
