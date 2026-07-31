import path from "node:path";
import { coverCacheDir, coversDir } from "@nanahoshi-v2/api/lib/cover-cache";

const DATA_DIR = path.join(process.cwd(), "data");

export const avatarsDir = path.join(DATA_DIR, "avatars");
export const headersDir = path.join(DATA_DIR, "headers");
export const serverLogosDir = path.join(DATA_DIR, "server-logos");
export const serverBackgroundsDir = path.join(DATA_DIR, "server-backgrounds");
export { coversDir };
export const tmpDir = coverCacheDir;
