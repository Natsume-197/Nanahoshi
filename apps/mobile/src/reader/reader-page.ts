import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";

// Built from apps/mobile/reader-embed by `bun run reader:bundle`: the page and
// the fonts and wasm it loads by relative URL.
const READER: {
	page: number;
	files: Record<string, number>;
} = require("../../assets/reader/manifest");

/** Query options for the page, shared by every screen that embeds it. */
export const readerPageQuery = {
	queryKey: ["reader-page"],
	queryFn: () => readerPageUri(),
	staleTime: Number.POSITIVE_INFINITY,
	// A local file: offline is no reason to wait.
	networkMode: "always" as const,
};

/**
 * The bundled reader page and its files, copied into the document directory
 * beside the books: a file:// page may only read files under the directory it
 * came from. One folder per build; once it is there, opening the reader reads
 * nothing (no asset hashing on every launch).
 */
export async function readerPageUri() {
	const page = Asset.fromModule(READER.page);
	const root = new Directory(Paths.document, "reader");
	const folder = new Directory(root, page.hash ?? "current");
	const index = new File(folder, "index.html");
	const result = { pageUri: index.uri, readableRoot: Paths.document.uri };
	if (index.exists) return result;

	root.create({ intermediates: true, idempotent: true });
	for (const old of root.list()) old.delete();
	folder.create({ idempotent: true });
	for (const [name, module] of Object.entries(READER.files))
		await install(Asset.fromModule(module), new File(folder, name));
	// Last: the page is the marker that the folder is complete.
	await install(page, index);
	sweepAssetCache();
	return result;
}

async function install(asset: Asset, target: File) {
	await asset.downloadAsync();
	if (!asset.localUri)
		throw new Error(`The reader file ${asset.name} is missing`);
	const source = new File(asset.localUri);
	source.copySync(target);
	// Android unpacks each asset into the cache first; that copy is spare now.
	if (isCacheCopy(source)) source.delete();
}

/** Earlier builds left their unpacked page (18 MB) and files in the cache. */
function sweepAssetCache() {
	try {
		for (const item of Paths.cache.list())
			if (item instanceof File && isCacheCopy(item)) item.delete();
	} catch {
		// Housekeeping only.
	}
}

function isCacheCopy(file: File) {
	return (
		file.uri.startsWith(Paths.cache.uri) &&
		/ExponentAsset-.*\.(html|woff2|wasm)$/.test(file.uri)
	);
}
