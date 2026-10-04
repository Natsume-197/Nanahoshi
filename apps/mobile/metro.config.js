const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The reader ships as one self-contained HTML asset (apps/reader-embed).
config.resolver.assetExts.push("html");

module.exports = config;
