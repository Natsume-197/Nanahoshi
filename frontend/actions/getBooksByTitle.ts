import { createClient } from "@/lib/client";
import { BookWithFormats } from "@/types";


// this will be useful in the search/page.tsx books 
// this action is sim as the getBooks by id.
const getBooksByTitle = async (title: string): Promise<BookWithFormats[]> => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .ilike('original_title', `%${title}%`) //this will give the precise search results
    .order('created_at', { ascending: false })

  if (error) {
    console.log(error.message);
  }

  return (data as any) || [];
};

export default getBooksByTitle;