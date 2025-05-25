// SeriesItem.tsx
"use client";

import Image from "next/image";
import useLoadImage from "@/hooks/useLoadImage";
import { SeriesWithCover } from "@/types";

interface SeriesItemProps {
    data: SeriesWithCover;
    onClick: (id: string) => void;
}

const SeriesItem: React.FC<SeriesItemProps> = ({ data, onClick }) => {
    const imagePath = useLoadImage(data);

    return (
<div
  onClick={() => onClick(data.book_id)}
  className="
    cursor-pointer
    group
    flex
    flex-row
    items-center
    bg-neutral-800/50
    hover:bg-neutral-800/70
    transition
    rounded-md
    overflow-hidden
    p-3
    shadow-md
    hover:shadow-lg
    min-h-[120px]
    w-full
  "
>
  <div className="relative flex-shrink-0 w-24 h-32 rounded-md overflow-hidden bg-neutral-700">
    <Image
      src={imagePath || "/images/music-placeholder.png"}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      alt={data.series_name}
      fill
      className="object-cover"
    />
  </div>

  <div className="flex-1 flex flex-col justify-between pl-4 h-full">
    {/* Parte superior */}
    <div className="flex flex-col gap-[2px]">
      <p className="text-white text-base font-semibold line-clamp-1 leading-tight">
        {data.series_name}
      </p>
      <p className="text-neutral-400 text-xs line-clamp-1 hover:underline leading-tight">
        3 books
      </p>
    </div>

    {/* Parte inferior: autor */}
    <p className="text-neutral-400 text-xs line-clamp-1 hover:underline mt-1">
      By Saiki
    </p>
  </div>
</div>

    );
};

export default SeriesItem;
