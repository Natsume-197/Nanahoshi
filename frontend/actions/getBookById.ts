// @ts-nocheck
import { createClient } from "@/lib/server";
import { BookWithFormats } from "../types";

const getBookById = async (bookId: string): Promise<any | null> => {
  const supabase = await createClient();

  // Lanzar consultas en paralelo
  const bookPromise = supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();

  const authorsPromise = supabase
    .from("book_authors")
    .select("authors(id, name)")
    .eq("book_id", bookId);

  const seriesInfoPromise = supabase
    .from("book_series")
    .select("series_id, position")
    .eq("book_id", bookId)
    .single();

  const formatsPromise = supabase
    .from("book_format")
    .select("id, format_type, file_path, file_size")
    .eq("book_id", bookId);

  // Esperar todas las consultas simultáneamente
  const [
    { data: book, error: bookError },
    { data: bookAuthors },
    { data: seriesInfo },
    { data: formatsData }
  ] = await Promise.all([
    bookPromise,
    authorsPromise,
    seriesInfoPromise,
    formatsPromise
  ]);

  if (bookError || !book) return null;

  let seriesBooks = [];
  if (seriesInfo?.series_id) {
    const { data: seriesBooksData } = await supabase
      .from("book_series")
      .select("book_id, position, books(id, original_title, cover_path)")
      .eq("series_id", seriesInfo.series_id)
      .order("position", { ascending: true });

    seriesBooks = seriesBooksData?.map((entry) => ({
      id: entry.books.id,
      original_title: entry.books.original_title,
      cover_path: entry.books.cover_path,
      position: entry.position
    })) || [];
  }

  return {
    ...book,
    authors: bookAuthors?.map((ba) => ({
      id: ba.authors.id,
      name: ba.authors.name
    })) || [],
    series: seriesInfo
      ? {
          id: seriesInfo.series_id,
          books: seriesBooks
        }
      : null,
    formats: formatsData || []
  };
};

export default getBookById;
