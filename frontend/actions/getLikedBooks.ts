import { BookWithFormats } from "@/types";
import { createClient } from '@/lib/server'

// we wana fetch the liked books fron the currently logged in user
const getLikedBooks = async (): Promise<BookWithFormats[]> => {
  const supabase = await createClient();

  const {
    data: userData,
    error: userError
  } = await supabase.auth.getUser();
  
  if (userError || !userData.user) {
    console.log(userError?.message || 'User not found');
    return [];
  }

  const { data } = await supabase 
    .from('liked_books')
    .select('*, books(*)') // the liked books table has relation with books, so we wanna fetch the entire book.
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })

  if (!data) return [];

  return data.map((item) => ({
    ...item.books //we re actually spreading the relation that populated with the one book that'll be loading
  }))
};

export default getLikedBooks;