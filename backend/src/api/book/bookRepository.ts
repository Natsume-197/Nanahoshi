import type { Book, CreateBookInput } from "./bookModel";
import supabase from "@/common/database/client";

export class BookRepository {
    async findByIdAsync(id: number): Promise<Book | null> {
        const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("id", id)
            .single();
        if (error) {
            if (error.code === "PGRST116" || error.code === "406") return null;
            throw error;
        }
        return data;
    }

    async findByLibraryIdAsync(libraryId: number): Promise<Book[]> {
        const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("library_id", libraryId);
        if (error) throw error;
        return data ?? [];
    }


    async createAsync(book: CreateBookInput): Promise<Book> {
        const { data, error } = await supabase
            .from("books")
            .insert(book)
            .select("*")
            .single();
        if (error) throw error;
        return data;
    }

    async deleteByIdAsync(id: number): Promise<boolean> {
        const { error } = await supabase
            .from("books")
            .delete()
            .eq("id", id);
        if (error) throw error;
        return true;
    }
}

export const bookRepository = new BookRepository();