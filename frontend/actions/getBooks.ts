import { createClient } from "@/lib/client";
import { cookies } from "next/headers";

import { BookWithFormats } from "@/types";

//pull the book from db into our server.
const getBooks = async (): Promise<BookWithFormats[]> => {
  const supabase = await createClient()

  //fetch books from db
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(15)

  if (error) {
    console.log(error.message);
  }

  return (data as any) || [];
};

export default getBooks; //lets use this in our page component