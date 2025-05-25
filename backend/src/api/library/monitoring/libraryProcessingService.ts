import supabase from "../../../common/database/client";
import { LibraryPath } from "../../../common/models/supabaseTableTypes";
import fs from "fs/promises";
import path from "path";

const SUPPORTED_EXTENSIONS = [".epub", ".pdf", ".cbz", ".cbr", ".cb7"];

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
        if (eventKind === "add") {
            // TODO: Transfer logic to bookService
            const { data: exists } = await supabase
                .from("books")
                .select("id")
                .eq("filename", filename)
                .eq("library_path_id", libraryPath.id)
                .maybeSingle();

            if (!exists) {
                let stats;
                try {
                    stats = await fs.stat(filePath);
                } catch {
                    stats = undefined;
                }
                await supabase.from("books").insert({
                    filename,
                    library_id: libraryId,
                    library_path_id: libraryPath.id,
                    filesize_kb: stats ? Math.round(stats.size / 1024) : null,
                    created_at: new Date().toISOString(),
                    last_modified: stats ? new Date(stats.mtime).toISOString() : null,
                });
                // TODO: Parse metadata and send notification
                console.log(`New book added: ${filename} (${filePath})`);
            }
        }
        if (eventKind === "unlink") {
            await supabase
                .from("books")
                .delete()
                .eq("filename", filename)
                .eq("library_path_id", libraryPath.id);
            // TODO: clean metadata and throw notification
            console.log(`Book removed from DB: ${filename} (${filePath})`);
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
                if(libraryPath.path){
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