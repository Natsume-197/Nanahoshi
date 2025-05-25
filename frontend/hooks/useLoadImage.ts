import { useSupabaseClient } from "@supabase/auth-helpers-react";

import { BookWithFormats, SeriesWithCover } from "@/types";

// hook to load the image from supabase.
const useLoadImage = (item: BookWithFormats | SeriesWithCover) => {
  const supabaseClient = useSupabaseClient();
  
  if (!item || !item.cover_path) {
    return null;
  }

  // data as imageData
  const { data: imageData } = supabaseClient
    .storage
    .from('covers')
    .getPublicUrl(item.cover_path);

  return imageData.publicUrl;
};

export default useLoadImage;