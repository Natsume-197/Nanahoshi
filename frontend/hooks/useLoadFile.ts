import { useSupabaseClient } from "@supabase/auth-helpers-react";


// hook to load the image from supabase.
const useLoadFile = (path: string) => {
  const supabaseClient = useSupabaseClient();

  const { data: fileData } = supabaseClient
    .storage
    .from('books')
    .getPublicUrl(path);

  return fileData.publicUrl;
};

export default useLoadFile;