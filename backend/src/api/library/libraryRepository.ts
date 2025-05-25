import type { Library, LibraryPath, LibraryWithPaths } from "@/common/models/supabaseTableTypes";
import { CreateLibraryInput } from "./libraryModel";

import supabase from "@/common/database/client";

export class LibraryRepository {
    async findAllAsync(): Promise<Library[]> {
        const { data, error } = await supabase
            .from("library")
            .select("*");

        if (error) throw error;
        return data ?? [];
    }

    async findByIdAsync(id: number): Promise<Library | null> {
        const { data, error } = await supabase
            .from("library")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            if (error.code === "PGRST116" || error.code === '406') return null;
            throw error;
        }
        return data;
    }

    async createAsync(data: CreateLibraryInput): Promise<LibraryWithPaths> {
        // 1. Create library
        const { data: library, error: libError } = await supabase
            .from("library")
            .insert({
                name: data.name,
                is_cron_watch: data.is_cron_watch ?? false,
            })
            .select()
            .single();

        if (libError) throw libError;

        let paths: LibraryPath[] = [];
        // 2. Insert paths related to library
        if (data.paths && data.paths.length > 0) {
            const pathsToInsert = data.paths.map((p) => ({
                library_id: library.id,
                path: p.path,
                is_enabled: p.is_enabled ?? true,
            }));

            const { data: insertedPaths, error: pathError } = await supabase
                .from("library_path")
                .insert(pathsToInsert)
                .select("*");

            if (pathError) throw pathError;
            paths = insertedPaths ?? [];
        }

        // 3. Insert owner related to library
        if (data.owner_user_id) {
            const { error: userLibError } = await supabase
                .from("user_library")
                .insert({
                    user_id: data.owner_user_id,
                    library_id: library.id,
                });

            if (userLibError) throw userLibError;
        }

        return { ...library, paths };
    }
}
