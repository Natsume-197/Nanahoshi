"use client";

import { BookWithFormats } from "@/types";
import MediaItem from "@/components/book/MediaItem";
import LikeButton from "@/components/ui/LikeButton";
import useOnPlay from "@/hooks/useOnPlay";


// this component is used to display the search results(below the search I/p)
interface SearchContentProps {
  books: BookWithFormats[];
}

const SearchContent: React.FC<SearchContentProps> = ({
  books
}) => {
  const onPlay = useOnPlay(books);

  if (books.length === 0) {
    return (
      <div 
        className="
          flex 
          flex-col 
          gap-y-2 
          w-full 
          px-6 
          text-neutral-400
        "
      >
        No books found.
      </div>
    )
  }

  return ( 
    <div className="flex flex-col gap-y-2 w-full px-6">
      {books.map((book: BookWithFormats) => (
        <div 
          key={book.id} 
          className="flex items-center gap-x-4 w-full"
        >
          <div className="flex-1">
            <MediaItem 
              onClick={(id: string) => onPlay(id)} 
              data={book}
            />
            {/* once the media Item shows(books list) we'l ve the option to like the books */}
          </div>
          <LikeButton bookId={book.id} />
        </div>
      ))}
    </div>
  );
}
 
export default SearchContent;