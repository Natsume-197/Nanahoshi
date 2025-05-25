import { createClient } from "@/lib/client";
import { BookWithFormats } from "@/types";

// Función para obtener una muestra aleatoria de elementos de un array
function getRandomSample<T>(arr: T[], sampleSize: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, sampleSize);
}

const getRandomBooks = async (): Promise<BookWithFormats[]> => {
  const supabase = createClient();

  // 1. Obtener todos los IDs de libros públicos (rápido si está indexado)
  const { data: idsData, error: idsError } = await supabase
    .from("books")
    .select("id")
    .is("user_id", null);

  if (idsError) {
    console.error("Error fetching book IDs:", idsError.message);
    return [];
  }

  if (!idsData || idsData.length === 0) return [];

  // 2. Seleccionar aleatoriamente 15 IDs en memoria
  const randomIds = getRandomSample(idsData.map(b => b.id), 15);

  // 3. Obtener los libros completos con esos IDs
  const { data: books, error } = await supabase
    .from("books")
    .select("*")
    .in("id", randomIds);

  if (error) {
    console.error("Error fetching random books:", error.message);
    return [];
  }

  return books as BookWithFormats[];
};

export default getRandomBooks;
