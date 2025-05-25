"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BookItem from "@/components/book/BookItem";
import BookContextMenu from "@/components/book/BookContextMenu";
import { BookWithFormats, Collection } from "@/types";
import { useRouter } from "next/navigation";
import AudioBookItem from "@/components/book/AudioBookItem";

interface PageContentProps {
  books: BookWithFormats[];
  collections: Collection[];
}

const PageContent: React.FC<PageContentProps> = ({ books, collections }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [hovered, setHovered] = useState(false);
  const router = useRouter();

  const checkFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 0);
    setShowRightFade(el.scrollWidth > el.clientWidth + el.scrollLeft);
  };

  useEffect(() => {
    checkFades();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkFades);
    return () => el.removeEventListener("scroll", checkFades);
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  if (books.length === 0) {
    return <div className="mt-4 text-neutral-400">No books available.</div>;
  }

  return (
    <div
      className="relative mt-4 "
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Flecha izquierda */}
      <button
        onClick={() => scroll("left")}
        className={`absolute cursor-pointer left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full shadow bg-neutral-800/70 hover:bg-neutral-700
          transition-all duration-300 ease-in-out 
          ${showLeftFade && hovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}`}
      >
        <ChevronLeft className="text-white" />
      </button>

      <button
        onClick={() => scroll("right")}
        className={`absolute right-2 cursor-pointer top-1/2 -translate-y-1/2 z-20 p-2 rounded-full shadow bg-neutral-800/70 hover:bg-neutral-700
          transition-all duration-300 ease-in-out 
          ${showRightFade && hovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"}`}
      >
        <ChevronRight className="text-white" />
      </button>

      {showLeftFade && (
        <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-neutral-900 to-transparent z-10" />
      )}
      {showRightFade && (
        <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-neutral-900 to-transparent z-10" />
      )}

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {books.map((item) => (
          <BookContextMenu key={item.id} collections={collections} book={item}>
            <div className="w-[200px] flex-shrink-0">
              <AudioBookItem onClick={(id: string) => router.push(`/book/${id}`)} data={item} />
            </div>
          </BookContextMenu>
        ))}
      </div>
    </div>
  );
};

export default PageContent;