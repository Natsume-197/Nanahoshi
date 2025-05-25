import { createClient } from '@/lib/server'
import { Collection } from "@/types";

const getCollectionsByUserId = async (): Promise<Collection[]> => {
  const supabase = await createClient();

  const {
    data: userData,
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    console.log(userError?.message || 'User not found');
    return [];
  }

  const {
    data: collections,
    error: collectionsError
  } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (collectionsError) {
    console.log(collectionsError.message);
    return [];
  }

  return collections || [];
};

export default getCollectionsByUserId;
