"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { CollectionWithBooksAndFormats } from "@/types";
import { useUser } from "@/hooks/useUser";
import MediaItem from "@/components/book/MediaItem";
import LikeButton from "@/components/ui/LikeButton";

interface CollectionContentProps {
  collectionWithBooks: CollectionWithBooksAndFormats[];
};

const CollectionContent: React.FC<CollectionContentProps> = ({
  collectionWithBooks
}) => {
  const router = useRouter();
  const { isLoading, user } = useUser();

  useEffect(() => {
    if (!isLoading && !user) { //if not logged in then redirect to home
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (collectionWithBooks[0].books.length === 0) {
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
        No books.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-y-2 w-full p-6">
      {collectionWithBooks.map((collection) =>
        collection.books.map((book) => (
          <div key={book.id} className="flex items-center gap-x-4 w-full">
            <div className="flex-1">
              <MediaItem data={book} />
            </div>
            <LikeButton bookId={book.id} />
          </div>
        ))
      )}
    </div>
  );
}

export default CollectionContent;