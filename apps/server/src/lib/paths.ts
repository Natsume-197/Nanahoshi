import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export const avatarsDir = path.join(DATA_DIR, "avatars");
export const headersDir = path.join(DATA_DIR, "headers");
export const coversDir = path.join(DATA_DIR, "covers");
export const tmpDir = path.join(DATA_DIR, "tmp");
