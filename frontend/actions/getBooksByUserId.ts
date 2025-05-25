import { createClient } from '@/lib/server'
import { BookWithFormats } from "@/types";

const getBooksByUserId = async (): Promise<BookWithFormats[]> => {
  const supabase = await createClient();

  const {
    data: userData,
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    console.log(userError.message);
    return [];
  }
  
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.log(error.message);
  }

  return (data as any) || [];
};

export default getBooksByUserId;