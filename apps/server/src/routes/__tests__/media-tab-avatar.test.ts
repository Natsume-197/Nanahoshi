import { expect, mock, test } from "bun:test";
import sharp from "sharp";

mock.module("@nanahoshi/auth", () => ({ auth: { api: {} } }));
mock.module("@nanahoshi/env/server", () => ({
	env: { SERVER_URL: "http://localhost:7333" },
}));
mock.module("@nanahoshi/api/auth/access.repository", () => ({
	getUserPermissionContext: async () => null,
}));
mock.module("@nanahoshi/api/auth/access.service", () => ({
	hasGlobal: () => false,
}));

const { renderTabAvatar, tabAvatarVariant } = await import("../media");

const photo = await sharp({
	create: { width: 200, height: 120, channels: 3, background: "#3366cc" },
})
	.png()
	.toBuffer();

async function alphaAt(image: Buffer, x: number, y: number) {
	const { data, info } = await sharp(image)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return data[(y * info.width + x) * info.channels + 3];
}

test("only the tab-bar variants are served; plain avatar URLs stay static", () => {
	expect(tabAvatarVariant("jpeg", undefined)).toBe("jpeg");
	expect(tabAvatarVariant("png", "circle")).toBe("png");
	expect(tabAvatarVariant(undefined, undefined)).toBeNull();
	expect(tabAvatarVariant("png", undefined)).toBeNull();
});

test("the circle variant is a square PNG with transparent corners", async () => {
	const image = await renderTabAvatar(photo, "png");
	const meta = await sharp(image).metadata();
	expect(meta.format).toBe("png");
	expect(meta.width).toBe(meta.height);
	expect(await alphaAt(image, 0, 0)).toBe(0);
	expect(await alphaAt(image, 48, 48)).toBe(255);
});
