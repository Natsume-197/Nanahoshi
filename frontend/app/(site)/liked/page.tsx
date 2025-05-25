import Image from "next/image";

import getLikedBooks from "@/actions/getLikedBooks";

import LikedContent from "./components/LikedContent";

export const revalidate = 0; //no cache

const Liked = async () => {
  const books = await getLikedBooks();

  return (
    <div 
      className="
        bg-neutral-900 
        rounded-lg 
        h-full 
        w-full 
        overflow-hidden 
        overflow-y-auto
      "
    >
        <div className="mt-20">
          <div 
            className="
              flex 
              flex-col 
              md:flex-row 
              items-center 
              gap-x-5
            "
          >
            <div className="relative h-32 w-32 lg:h-44 lg:w-44">
              <Image
                className="object-cover"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                src="/images/liked.png"
                alt="Playlist"
              />
            </div>
            <div className="flex flex-col gap-y-2 mt-4 md:mt-0">
              <p className="hidden text-white md:block font-semibold text-sm">
                Playlist
              </p>
              <h1 
                className="
                  text-white 
                  text-4xl 
                  sm:text-5xl 
                  lg:text-7xl 
                  font-bold
                  cursor-pointer
                "
              >
                Liked Books
              </h1>
            </div>
          </div>
        </div>
      <LikedContent books={books} />
    </div>
  );
}

export default Liked;