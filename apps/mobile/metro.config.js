const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The reader ships as an HTML page plus its fonts and wasm, built by
// ./reader-embed, a Vite page Metro must never crawl or bundle.
config.resolver.assetExts.push("html", "woff2", "wasm");
const readerEmbed = path.join(__dirname, "reader-embed");
config.resolver.blockList = [
	...[config.resolver.blockList].flat(),
	new RegExp(`^${readerEmbed.replace(/[/\\.]/g, "\\$&")}[/\\\\].*`),
];

module.exports = config;
