"use client";

import Image from "next/image";
import useLoadImage from "@/hooks/useLoadImage";
import { BookWithFormats } from "@/types";
import ReadButton from "@/components/ui/ReadButton";

interface BookItemProps {
  data: BookWithFormats;
  onClick: (id: string) => void;
}

const BookItem: React.FC<BookItemProps> = ({
  data,
  onClick
}) => {
  const imagePath = useLoadImage(data); //load the image

  return ( 
    <div
      onClick={() => onClick(data.id)} 
      className="
        relative 
        group 
        flex 
        flex-col 
        items-center 
        justify-center 
        rounded-md 
        overflow-hidden 
        gap-x-4 
        cursor-pointer 
        hover:bg-neutral-400/10 
        transition 
        p-3
      "
    >
      <div 
        className="
          relative 
          aspect-[2/3] 
          w-full
          h-full 
          rounded-md 
          overflow-hidden
        "
      >
        <Image
          className="object-scale-down"
          priority={true}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          src={imagePath || '/images/music-placeholder.png'}
          fill
          alt="Image"
        />
      </div>
      <div className="flex flex-col items-start w-full pt-2 gap-y-1">
        <p className="font-semibold text-white/90 text-sm leading-relaxed line-clamp-2">
          {data.original_title}
        </p>
        <p 
          className="
            text-neutral-400 
            text-sm 
            w-full 
            truncate
            hover:underline
          "
        >
           Saiki
        </p>
      </div>
      <div 
        className="
          absolute 
          bottom-26 
          right-5
        "
      >
        <ReadButton/> 
      </div>
    </div>
   );
}
 
export default BookItem;