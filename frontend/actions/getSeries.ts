import { createClient } from "@/lib/client";
import { Series } from "@/types";

const getSeries = async (): Promise<Series[]> => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('series')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Error fetching series:", error.message);
    return [];
  }

  return data as Series[];
};

export default getSeries;
