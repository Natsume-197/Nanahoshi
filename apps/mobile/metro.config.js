const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The reader ships as one self-contained HTML asset built by ./reader-embed,
// a Vite page Metro must never crawl or bundle.
config.resolver.assetExts.push("html");
const readerEmbed = path.join(__dirname, "reader-embed");
config.resolver.blockList = [
	...[config.resolver.blockList].flat(),
	new RegExp(`^${readerEmbed.replace(/[/\\.]/g, "\\$&")}[/\\\\].*`),
];

module.exports = config;
