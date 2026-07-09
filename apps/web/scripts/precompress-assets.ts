// Post-build: writes .br/.gz siblings for compressible client assets so the
// production server (server.ts) can serve precompressed bytes with zero
// runtime cost. Bun.serve does not compress responses on its own.

import path from "node:path";
import zlib from "node:zlib";

const clientDir = path.join(import.meta.dir, "../dist/client");

// Text formats only; woff2/png/webp/ico are already compressed.
const COMPRESSIBLE = /\.(js|css|html|svg|json|webmanifest|txt|xml|map)$/;
const MIN_BYTES = 1024;

let written = 0;
let savedBytes = 0;

for await (const file of new Bun.Glob("**/*").scan({
	cwd: clientDir,
	onlyFiles: true,
})) {
	if (!COMPRESSIBLE.test(file)) continue;
	const filepath = path.join(clientDir, file);
	const source = Buffer.from(await Bun.file(filepath).arrayBuffer());
	if (source.length < MIN_BYTES) continue;

	const brotli = zlib.brotliCompressSync(source, {
		params: {
			[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
			[zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
		},
	});
	const gzip = zlib.gzipSync(source, { level: 9 });

	// Only keep variants that actually shrink the file.
	if (brotli.length < source.length) {
		await Bun.write(`${filepath}.br`, brotli);
		written++;
	}
	if (gzip.length < source.length) {
		await Bun.write(`${filepath}.gz`, gzip);
		written++;
	}
	savedBytes += source.length - Math.min(brotli.length, gzip.length);
}

console.log(
	`precompress-assets: ${written} files written (~${(savedBytes / 1024).toFixed(0)} KB saved for best-encoding clients)`,
);
