import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";

// Built from apps/mobile/reader-embed by `bun run reader:bundle`.
const READER_PAGE = require("../../assets/reader/reader.html");

/** Query options for the page, shared by every screen that embeds it. */
export const readerPageQuery = {
	queryKey: ["reader-page"],
	queryFn: () => readerPageUri(),
	staleTime: Number.POSITIVE_INFINITY,
	// A local file: offline is no reason to wait.
	networkMode: "always" as const,
};

/**
 * The bundled reader page, copied into the document directory beside the
 * books: a file:// page may only read files under the directory it came from.
 */
export async function readerPageUri() {
	const asset = Asset.fromModule(READER_PAGE);
	await asset.downloadAsync();
	const directory = new Directory(Paths.document, "reader");
	directory.create({ intermediates: true, idempotent: true });
	const page = new File(directory, `reader-${asset.hash}.html`);
	if (!page.exists) {
		for (const old of directory.list()) old.delete();
		if (!asset.localUri) throw new Error("The reader page is missing");
		new File(asset.localUri).copySync(page);
	}
	return { pageUri: page.uri, readableRoot: Paths.document.uri };
}
