import supabase from "../../../common/database/client";
import { LibraryPath } from "../../../common/models/supabaseTableTypes";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const SUPPORTED_EXTENSIONS = [".epub", ".pdf", ".cbz", ".cbr", ".cb7"];

// Get hash SHA256 from a file
async function calculateFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const stream = (await fs.open(filePath, "r")).createReadStream();
    return new Promise((resolve, reject) => {
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
}

const pendingDeletions = new Map<string, NodeJS.Timeout>();

class LibraryProcessingService {
    // Events to process
    async processFile(
        eventKind: "add" | "unlink",
        libraryId: number,
        libraryPath: LibraryPath,
        filePath: string
    ) {
        const ext = path.extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

        const filename = path.basename(filePath);
        const relativePath = path.relative(libraryPath.path!, filePath);
        // ----------- ADD -----------
        if (eventKind === "add") {
            let fileHash: string | null = null;
            let stats;
            try {
                fileHash = await calculateFileHash(filePath);
                stats = await fs.stat(filePath);
            } catch (e) {
                console.error("[ADD] Error to calculate hash or stat:", e, "File:", filePath);
                return;
            }
            if (!fileHash) return;

            // Remove every delete petition already done for this path
            const pendingKey = `${libraryId}:${libraryPath.id}:${relativePath}`;
            if (pendingDeletions.has(pendingKey)) {
                clearTimeout(pendingDeletions.get(pendingKey)!);
                pendingDeletions.delete(pendingKey);
            }

            const { data: bookByPath, error: errorByPath } = await supabase
                .from("books")
                .select("*")
                .eq("library_id", libraryId)
                .eq("library_path_id", libraryPath.id)
                .eq("relative_path", relativePath)
                .maybeSingle();

            if (errorByPath) {
                console.error("[ADD] Error searching book by path:", errorByPath);
                return;
            }

            if (bookByPath) {
                // Update path
                const needsUpdate =
                    bookByPath.filename !== filename ||
                    bookByPath.filehash !== fileHash ||
                    bookByPath.filesize_kb !== (stats ? Math.round(stats.size / 1024) : null);

                if (needsUpdate) {
                    const { error: updateError } = await supabase
                        .from("books")
                        .update({
                            filename,
                            filehash: fileHash,
                            filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                            last_modified: stats ? new Date(stats.mtime).toISOString() : null
                        })
                        .eq("id", bookByPath.id);
                    if (updateError) {
                        console.error("[ADD] Error updating book:", updateError);
                    } else {
                        console.log(`[ADD] Book updated: ${filename} (${relativePath})`);
                    }
                } else {
                    // console.log(`[ADD] Book already updated: ${filename} (${relativePath})`);
                }
                return;
            }

            // Hash search (the book exists before?)
            const { data: bookByHash, error: errorByHash } = await supabase
                .from("books")
                .select("*")
                .eq("filehash", fileHash)
                .maybeSingle();

            if (errorByHash) {
                console.error("[ADD] Error searching book by hash:", errorByHash);
                return;
            }

            if (bookByHash) {
                // Update book with new path
                const { error: updateError } = await supabase
                    .from("books")
                    .update({
                        filename,
                        library_id: libraryId,
                        library_path_id: libraryPath.id,
                        relative_path: relativePath,
                        filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                        last_modified: stats ? new Date(stats.mtime).toISOString() : null
                    })
                    .eq("id", bookByHash.id);
                if (updateError) {
                    console.error("[ADD] Error moving book:", updateError);
                } else {
                    console.log(`[ADD] Book moved/updated: ${filename} (${relativePath})`);
                }
                return;
            }

            // If it doesnt exist, create a new book
            const { error: insertError } = await supabase.from("books").insert({
                filename,
                library_id: libraryId,
                filehash: fileHash,
                library_path_id: libraryPath.id,
                relative_path: relativePath,
                filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                created_at: new Date().toISOString(),
                last_modified: stats ? new Date(stats.mtime).toISOString() : null
            });
            if (insertError) {
                console.error("[ADD] Error inserting book:", insertError);
            } else {
                console.log(`[ADD] Book added: ${filename} (${relativePath})`);
            }
            return;
        }

        // ----------- UNLINK -----------
        if (eventKind === "unlink") {
            const pendingKey = `${libraryId}:${libraryPath.id}:${relativePath}`;

            // Search exact book by location
            const { data: existingBook, error: selectError } = await supabase
                .from("books")
                .select("*")
                .eq("library_id", libraryId)
                .eq("library_path_id", libraryPath.id)
                .eq("relative_path", relativePath)
                .maybeSingle();

            if (selectError) {
                console.error("[UNLINK] Error searching book for delete:", selectError);
                return;
            }
            if (!existingBook) {
                // console.log(`[UNLINK] Book not found in BD: ${filename} (${relativePath})`);
                return;
            }

            // MUST: Remove every delete petition already done for this path
            if (pendingDeletions.has(pendingKey)) {
                clearTimeout(pendingDeletions.get(pendingKey)!);
                pendingDeletions.delete(pendingKey);
            }

            // Schedule Delete (10s)
            const timeout = setTimeout(async () => {
                // Once again, will look for the register before deleting it
                const { data: refreshedBook, error: refetchError } = await supabase
                    .from("books")
                    .select("*")
                    .eq("id", existingBook.id)
                    .maybeSingle();

                if (refetchError) {
                    console.error("[UNLINK] Error refetching libro:", refetchError);
                    pendingDeletions.delete(pendingKey);
                    return;
                }

                // ONLY delete if book is the same as initial schedule delete (unlink)
                const sameLocation =
                    refreshedBook &&
                    refreshedBook.filename === filename &&
                    refreshedBook.library_id === libraryId &&
                    refreshedBook.library_path_id === libraryPath.id &&
                    refreshedBook.relative_path === relativePath;

                if (sameLocation) {
                    const { error: deleteError } = await supabase
                        .from("books")
                        .delete()
                        .eq("id", existingBook.id);
                    if (deleteError) {
                        console.error("[UNLINK] Error deleting book:", deleteError);
                    } else {
                        console.log(`[UNLINK] Book removed from DB: ${filename} (${relativePath})`);
                    }
                } else {
                    console.log(`[UNLINK] Not deleted: book was moved or updated (${filename} -> ${refreshedBook?.relative_path})`);
                }
                pendingDeletions.delete(pendingKey);
            }, 10000);

            pendingDeletions.set(pendingKey, timeout);
        }
    }

    // Full scan
    async rescanLibrary(libraryId: number) {
        const { data: paths } = await supabase
            .from("library_path")
            .select("*")
            .eq("library_id", libraryId)
            .eq("is_enabled", true);

        if (!paths) return;

        for (const libraryPath of paths) {
            let files: string[] = [];
            if (libraryPath.path) {
                try {
                    files = await this.walkAndCollectFiles(libraryPath.path);
                } catch (e) {
                    console.error(`Error reading path ${libraryPath.path}:`, e);
                    continue;
                }
                for (const file of files) {
                    await this.processFile("add", libraryId, libraryPath, file);
                }
            }
        }
    }

    // Get every file in a recursive way
    async walkAndCollectFiles(basePath: string): Promise<string[]> {
        let results: string[] = [];
        const dirents = await fs.readdir(basePath, { withFileTypes: true });
        for (const dirent of dirents) {
            const resolved = path.resolve(basePath, dirent.name);
            if (dirent.isDirectory()) {
                results = results.concat(await this.walkAndCollectFiles(resolved));
            } else if (
                SUPPORTED_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())
            ) {
                results.push(resolved);
            }
        }
        return results;
    }
}

export const libraryProcessingService = new LibraryProcessingService();