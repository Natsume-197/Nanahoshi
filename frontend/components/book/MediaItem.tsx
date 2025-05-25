"use client";

import Image from "next/image";

import useLoadImage from "@/hooks/useLoadImage";
import { BookWithFormats } from "@/types";
import usePlayer from "@/hooks/usePlayer";

interface MediaItemProps {
  data: BookWithFormats;
  onClick?: (id: string) => void;
}

// this comp appears on the left sidebar 
const MediaItem: React.FC<MediaItemProps> = ({
  data,
  onClick,
}) => {
  const player = usePlayer();
  const imageUrl = useLoadImage(data);

  const handleClick = () => {
    if (onClick) {
      return onClick(data.id);
    }
  // default turn on player
    return player.setId(data.id);
  };

  return ( 
    <div
      onClick={handleClick}
      className="
        flex 
        items-center 
        gap-x-3 
        cursor-pointer 
        hover:bg-neutral-800/50 
        w-full 
        p-2 
        rounded-md
      "
    >
      <div 
        className="
          relative 
          rounded-md 
          min-h-[48px] 
          min-w-[48px] 
          overflow-hidden
        "
      >
        <Image
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          src={imageUrl || "/images/music-placeholder.png"}
          alt="MediaItem"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-y-1 overflow-hidden">
        <p className="text-white truncate">{data.original_title}</p>
        <p className="text-neutral-400 text-sm truncate">
          By Saiki
        </p>
      </div>
    </div>
  );
}
 
export default MediaItem;