import type { Book, CreateBookInput } from "./bookModel";
import supabase from "@/common/database/client";

export class BookRepository {
    // CRUD
    async findById(id: number): Promise<Book | null> {
        const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
        if (error) {
            if (error.code === "PGRST116" || error.code === "406") return null;
            throw error;
        }
        return data;
    }

    async findAll(): Promise<Book[]> {
        const { data, error } = await supabase.from("books").select("*");
        if (error) throw error;
        return data ?? [];
    }

    async insertBook(book: CreateBookInput) {
        const { error } = await supabase.from("books").insert(book);
        if (error) {
            if (error.code === "PGRST116" || error.code === "406") return null;
            throw error;
        }
    }

    async updateBook(id: number, updates: Partial<Book>) {
        const { error } = await supabase.from("books").update(updates).eq("id", id);
        if (error) {
            if (error.code === "PGRST116" || error.code === "406") return null;
            throw error;
        }
    }

    async deleteBook(id: number) {
        const { error } = await supabase.from("books").delete().eq("id", id);
        if (error) {
            if (error.code === "PGRST116" || error.code === "406") return null;
            throw error;
        }
    }

    // Miscellaneous queries
    async findByLibraryIdAsync(libraryId: number): Promise<Book[]> {
        const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("library_id", libraryId);
        if (error) throw error;
        return data ?? [];
    }

    async findByPath(libraryId: number, libraryPathId: number, relativePath: string): Promise<Book | null> {
        const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("library_id", libraryId)
            .eq("library_path_id", libraryPathId)
            .eq("relative_path", relativePath)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async findByHash(fileHash: string): Promise<Book | null> {
        const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("filehash", fileHash)
            .maybeSingle();
        if (error) throw error;
        return data;
    }
}

export const bookRepository = new BookRepository();