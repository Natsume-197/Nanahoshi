import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const SUPPORTED_EXTENSIONS = [".epub", ".pdf", ".cbz", ".cbr", ".cb7"];

export async function calculateFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const stream = (await fs.open(filePath, "r")).createReadStream();
    return new Promise((resolve, reject) => {
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
}

export async function walkAndCollectFiles(basePath: string): Promise<string[]> {
    let results: string[] = [];
    const dirents = await fs.readdir(basePath, { withFileTypes: true });
    for (const dirent of dirents) {
        const resolved = path.resolve(basePath, dirent.name);
        if (dirent.isDirectory()) {
            results = results.concat(await walkAndCollectFiles(resolved));
        } else if (
            SUPPORTED_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())
        ) {
            results.push(resolved);
        }
    }
    return results;
}
