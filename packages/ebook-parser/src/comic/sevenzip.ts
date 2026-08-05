import SevenZip from "7z-wasm";
import type { ComicArchive } from "./archive";

// 7z-wasm is GNU LGPL plus the unRAR restriction: its unRAR sources must not
// be used to recreate the proprietary RAR compression algorithm. We invoke it
// strictly as a decompressor. See the package README and bundled License.txt.

interface ListedEntry {
	rawName: string;
	name: string;
}

export async function openSevenZipArchive(
	data: Uint8Array,
): Promise<ComicArchive> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	let captureOutput = true;
	const sevenZip = await SevenZip({
		print: (line) => {
			if (captureOutput) stdout.push(line);
		},
		printErr: (line) => {
			if (captureOutput) stderr.push(line);
		},
	});
	sevenZip.FS.writeFile("archive.bin", data);
	sevenZip.callMain(["l", "-slt", "-ba", "archive.bin"]);

	const entries = parseListing(stdout);
	if (!entries.length) {
		throw new Error(stderr.at(-1) || "Archive contains no files");
	}
	if (listingIsEncrypted(stdout)) {
		throw new Error("Encrypted comic archives are not supported");
	}
	captureOutput = false;
	stdout.length = 0;
	stderr.length = 0;

	const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
	const cache = new Map<string, Uint8Array>();
	let extractionIndex = 0;
	let closed = false;

	return {
		names: () => entries.map(({ name }) => name),
		async read(name) {
			if (closed) throw new Error("Comic archive is already closed");
			const cached = cache.get(name);
			if (cached) return cached;
			const entry = entryByName.get(name);
			if (!entry) return undefined;

			const outputDirectory = `/extract-${extractionIndex++}`;
			sevenZip.FS.mkdir(outputDirectory);
			sevenZip.callMain([
				"x",
				"archive.bin",
				`-o${outputDirectory}`,
				"-y",
				"--",
				entry.rawName,
			]);
			const extractedPath = `${outputDirectory}/${entry.name}`;
			try {
				const bytes = Uint8Array.from(sevenZip.FS.readFile(extractedPath));
				cache.set(name, bytes);
				return bytes;
			} catch {
				throw new Error(`Could not extract comic archive entry: ${name}`);
			}
		},
		async close() {
			closed = true;
			cache.clear();
		},
	};
}

function parseListing(lines: readonly string[]): ListedEntry[] {
	const entries: ListedEntry[] = [];
	for (const line of lines.flatMap((value) => value.split("\n"))) {
		const rawName = line.match(/Path = (.+)$/)?.[1]?.trim();
		if (!rawName) continue;
		const name = normalizeEntryName(rawName);
		if (name && !name.endsWith("/")) entries.push({ rawName, name });
	}
	return entries;
}

function listingIsEncrypted(lines: readonly string[]): boolean {
	return lines.some((value) => /Encrypted = \+/m.test(value));
}

function normalizeEntryName(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}
