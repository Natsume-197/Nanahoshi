"use client";

import Image from "next/image";
import useLoadImage from "@/hooks/useLoadImage";
import { BookWithFormats } from "@/types";
import DownloadButton from "@/components/ui/DownloadButton";

interface BookHeaderProps {
  book: BookWithFormats;
}

export default function BookHeader({ book }: BookHeaderProps) {
  const imagePath = useLoadImage(book);

  return (
    <div className="mt-20 flex flex-col md:flex-row gap-6 items-start px-6">
      <div className="relative h-32 w-32 lg:h-44 lg:w-44 flex-shrink-0">
        <Image
          className="object-cover rounded-md"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          src={imagePath || "/images/music-placeholder.png"}
          alt={book.original_title}
        />
      </div>

      <div className="flex flex-col gap-4 text-white">
        <div>
          <p className="text-sm text-neutral-400 font-semibold">Book</p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            {book.original_title}
          </h1>
        </div>

        {book.authors && book.authors.length > 0 && (
          <p className="text-neutral-300 text-sm max-w-2xl leading-relaxed whitespace-pre-line">
            {book.authors.map((item, index) => (
              <span key={item.id}>
                {item.name}
                {index < book.authors.length - 1 && ", "}
              </span>
            ))}
          </p>
        )}
        <DownloadButton
         key={book.formats[0].id}
         fileUrl={book.formats[0].file_path}
         />
      </div>
    </div>
  );
}
