"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BookWithFormats } from "@/types";
import { useUser } from "@/hooks/useUser";
import MediaItem from "@/components/book/MediaItem";
import LikeButton from "@/components/ui/LikeButton";
import useOnPlay from "@/hooks/useOnPlay";

interface LikedContentProps {
  books: BookWithFormats[];
};

const LikedContent: React.FC<LikedContentProps> = ({
  books
}) => {
  const router = useRouter();
  const { isLoading, user } = useUser();

  const onPlay = useOnPlay(books);

  useEffect(() => {
    if (!isLoading && !user) { //if not logged in then redirect to home
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (books.length === 0) {
    return (
      <div 
        className="
          flex 
          flex-col 
          gap-y-2 
          w-full px-6 
          text-neutral-400
        "
      >
        No liked books.
      </div>
    )
  }
  return ( 
    // then render the liked books/contents.. and also add the like button
    <div className="flex flex-col gap-y-2 w-full p-6">
      {books.map((book: BookWithFormats) => (
        <div 
          key={book.id} 
          className="flex items-center gap-x-4 w-full"
        >
          <div className="flex-1">
            <MediaItem onClick={(id) => onPlay(id)} data={book} />
          </div>
          <LikeButton bookId={book.id} />
        </div>
      ))}
    </div>
  );
}
 
export default LikedContent;