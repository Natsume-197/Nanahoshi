import StreamZip from "node-stream-zip";
import type { ZipArchive } from "./archive";

export async function openZipFile(filePath: string): Promise<ZipArchive> {
	const zip = new StreamZip.async({ file: filePath });
	const entries = await zip.entries().catch(async (error) => {
		await zip.close();
		throw error;
	});

	return {
		has: (name) => Object.hasOwn(entries, name),
		names: () => Object.keys(entries),
		async text(name) {
			const data = await zip.entryData(name);
			if (!data) return undefined;
			const text = data.toString("utf8");
			return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
		},
		async bytes(name) {
			const data = await zip.entryData(name);
			return data ? Uint8Array.from(data) : undefined;
		},
		async close() {
			await zip.close();
		},
	};
}
