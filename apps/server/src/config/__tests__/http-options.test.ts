import { expect, test } from "bun:test";
import { MAX_UPLOAD_REQUEST_BYTES } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { withHttpRequestLimits } from "../http-options";

test("raises Bun's request limit high enough for an allowed multipart upload", () => {
	const fetch = () => new Response("ok");
	const options = withHttpRequestLimits({ fetch });

	expect(options.fetch).toBe(fetch);
	expect(options.maxRequestBodySize).toBe(MAX_UPLOAD_REQUEST_BYTES);
});
