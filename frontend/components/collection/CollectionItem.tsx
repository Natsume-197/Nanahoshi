"use client";

import Image from "next/image";

import { Collection } from "@/types";

interface CollectionItemProps {
  data: Collection;
  onClick?: (id: string) => void;
}

// this comp appears on the left sidebar 
const CollectionItem: React.FC<CollectionItemProps> = ({
  data,
  onClick,
}) => {

  const handleClick = () => {
    if (onClick) {
      return onClick(data.id);
    }
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
          src={"/images/collection_placeholder.png"}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          alt="MediaItem"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-y-1 overflow-hidden">
        <p className="text-white truncate">{data.name}</p>
        <p className="text-neutral-400 text-sm truncate">
          Collection
        </p>
      </div>
    </div>
  );
}
 
export default CollectionItem;