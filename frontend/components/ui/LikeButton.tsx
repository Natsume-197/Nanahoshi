"use client";

import { useEffect, useState } from "react";
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useSessionContext } from "@supabase/auth-helpers-react";

import { useUser } from "@/hooks/useUser";
import useAuthModal from "@/hooks/modals/useAuthModal";


// the comp to like the book and add them into our favourites/liked list
interface LikeButtonProps {
  bookId: string;
};

const LikeButton: React.FC<LikeButtonProps> = ({
  bookId
}) => {
  const router = useRouter();
  const {
    supabaseClient
  } = useSessionContext();
  const authModal = useAuthModal();
  const { user } = useUser();

  const [isLiked, setIsLiked] = useState<boolean>(false);

  // will check whether the book we re loading is liked or not in the supabase table(liked_books Table)
  useEffect(() => {
    if (!user?.id) {
      return;
    }
  
    const fetchData = async () => {
      const { data, error } = await supabaseClient
        .from('liked_books') //search from this table with the both user and book id.
        .select('*')
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .single();

      if (!error && data) {
        setIsLiked(true);
      }
    }

    fetchData();
  }, [bookId, supabaseClient, user?.id]);


// lets render the icon depending on whether the book is liked or not
  const Icon = isLiked ? AiFillHeart : AiOutlineHeart;

  const handleLike = async () => {
    if (!user) {
      return authModal.onOpen();
    }
    //if its already liked, then delete it from the liked_books table
    if (isLiked) {
      const { error } = await supabaseClient
        .from('liked_books')
        .delete()
        .eq('user_id', user.id)
        .eq('book_id', bookId)

      if (error) {
        toast.error(error.message);
      } else {
        setIsLiked(false);
      }
    } else { //otherwise, add it to the liked_books table
      const { error } = await supabaseClient
        .from('liked_books')
        .insert({
          book_id: bookId,
          user_id: user.id
        });

      if (error) {
        toast.error(error.message);
      } else {
        setIsLiked(true);
        toast.success('Added to your favourites');
      }
    }

    router.refresh();
  }

  return (
    <button 
      className="
        cursor-pointer 
        hover:opacity-75 
        transition
      "
      onClick={handleLike}
    >
      <Icon color={isLiked ? '#22c55e' : 'white'} size={25} />
    </button>
  );
}

export default LikeButton;