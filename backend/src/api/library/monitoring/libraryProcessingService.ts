import supabase from "../../../common/database/client";
import { LibraryPath } from "../../../common/models/supabaseTableTypes";
import fs from "fs/promises";
import path from "path";
import { bookRepository } from "../../book/bookRepository";
import { calculateFileHash, walkAndCollectFiles, SUPPORTED_EXTENSIONS } from "../../../common/utils/fileUtils";

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

            let bookByPath: any = null;
            try {
                bookByPath = await bookRepository.findByPath(libraryId, libraryPath.id, relativePath);
            } catch (errorByPath) {
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
                    try {
                        await bookRepository.updateBook(bookByPath.id, {
                            filename,
                            filehash: fileHash,
                            filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                            last_modified: stats ? new Date(stats.mtime).toISOString() : null
                        });
                        console.log(`[ADD] Book updated: ${filename} (${relativePath})`);
                    } catch (updateError) {
                        console.error("[ADD] Error updating book:", updateError);
                    }
                } else {
                    // console.log(`[ADD] Book already updated: ${filename} (${relativePath})`);
                }
                return;
            }

            // Hash search (the book exists before?)
            let bookByHash: any = null;
            try {
                bookByHash = await bookRepository.findByHash(fileHash);
            } catch (errorByHash) {
                console.error("[ADD] Error searching book by hash:", errorByHash);
                return;
            }

            if (bookByHash) {
                try {
                    await bookRepository.updateBook(bookByHash.id, {
                        filename,
                        library_id: libraryId,
                        library_path_id: libraryPath.id,
                        relative_path: relativePath,
                        filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                        last_modified: stats ? new Date(stats.mtime).toISOString() : null
                    });
                    console.log(`[ADD] Book moved/updated: ${filename} (${relativePath})`);
                } catch (updateError) {
                    console.error("[ADD] Error moving book:", updateError);
                }
                return;
            }

            // If it doesnt exist, create a new book
            try {
                await bookRepository.insertBook({
                    filename,
                    library_id: libraryId,
                    filehash: fileHash,
                    library_path_id: libraryPath.id,
                    relative_path: relativePath,
                    filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                    last_modified: stats ? new Date(stats.mtime).toISOString() : null
                });
                console.log(`[ADD] Book added: ${filename} (${relativePath})`);
            } catch (insertError) {
                console.error("[ADD] Error inserting book:", insertError);
            }
            return;
        }

        // ----------- UNLINK -----------
        if (eventKind === "unlink") {
            const pendingKey = `${libraryId}:${libraryPath.id}:${relativePath}`;

            // Search exact book by path
            let existingBook: any = null;
            try {
                existingBook = await bookRepository.findByPath(libraryId, libraryPath.id, relativePath);
            } catch (selectError) {
                console.error("[UNLINK] Error searching book for delete:", selectError);
                return;
            }
            if (!existingBook) return;


            // MUST: Remove every delete petition already done for this path
            if (pendingDeletions.has(pendingKey)) {
                clearTimeout(pendingDeletions.get(pendingKey)!);
                pendingDeletions.delete(pendingKey);
            }

            // Schedule Delete (10s)
            const timeout = setTimeout(async () => {
                // Once again, will look for the register before deleting it
                let refreshedBook: any = null;
                try {
                    refreshedBook = await bookRepository.findById(existingBook.id);
                } catch (refetchError) {
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
                    try {
                        await bookRepository.deleteBook(existingBook.id);
                        console.log(`[UNLINK] Book removed from DB: ${filename} (${relativePath})`);
                    } catch (deleteError) {
                        console.error("[UNLINK] Error deleting book:", deleteError);
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
                    files = await walkAndCollectFiles(libraryPath.path);
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
}

export const libraryProcessingService = new LibraryProcessingService();