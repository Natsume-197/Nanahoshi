import { createClient } from "@/lib/client";
import { cookies } from "next/headers";
import { SeriesWithCover } from "@/types";

const getSeriesWithCovers = async (): Promise<SeriesWithCover[]> => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("series_with_first_book")
    .select("*")
    .limit(10);

  if (error) {
    console.error("Error fetching series with covers:", error.message);
    return [];
  }

  return data as SeriesWithCover[];
};

export default getSeriesWithCovers;
