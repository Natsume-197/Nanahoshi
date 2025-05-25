import * as ContextMenu from "@radix-ui/react-context-menu";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { BookWithFormats, Collection } from "@/types";
import { twMerge } from "tailwind-merge";
import { BiBookOpen, BiLike } from "react-icons/bi";
import { GoPlusCircle } from "react-icons/go";
import AddToCollectionButton from "@/components/collection/AddCollectionButton";
import { CopyIcon, DownloadIcon, MailIcon } from "lucide-react";
import { FiShare2 } from "react-icons/fi";

interface BookContextMenuProps {
  children: React.ReactNode;
  collections: Collection[];
  book: BookWithFormats;
}

const BookContextMenu = ({
  children,
  collections,
  book
}: BookContextMenuProps) => {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="">
          {children}
        </div>
      </ContextMenu.Trigger>


      <ContextMenu.Portal>
        <ContextMenu.Content
          className="
            z-50 
            min-w-[200px]
            rounded-md 
            bg-neutral-800 
            p-1 
            shadow-lg 
            border 
            border-transparent
            text-sm 
            text-white 
            animate-in 
            fade-in
            cursor-pointer
            focus:outline-none 
            focus:ring-0 
            focus:ring-transparent
          "
        >
          <ContextMenu.Item className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-2 rounded cursor-pointer">
            <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
              <BiLike className="text-white" size={20} />
              <p className="truncate w-full">Like</p>
            </button>
          </ContextMenu.Item>

          <ContextMenu.Item className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-2 rounded cursor-pointer">
            <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
              <DownloadIcon className="text-white" size={20} />
              <p className="truncate w-full">Download book</p>
            </button>
          </ContextMenu.Item>

          <ContextMenu.Separator className="borde border-b border-neutral-700 my-0.5" />

          <ContextMenu.Item className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-2 rounded cursor-pointer">
            <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
              <BiBookOpen className="text-white" size={20} />
              <p className="truncate w-full">Read on Lumi Reader</p>
            </button>
          </ContextMenu.Item>

          <ContextMenu.Separator className="borde border-b border-neutral-700 my-0.5" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-3 rounded flex items-center justify-between cursor-pointer">
              <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
                <GoPlusCircle className="text-white" size={20} />
                <p className="truncate w-full">Add to Collection</p>
              </button>
              <ChevronRightIcon />
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent className="bg-neutral-800 focus:outline-none focus:ring-0 focus:ring-transparent border border-transparent rounded-md shadow-lg p-1 text-white">
              {collections.length > 0 ? (
                collections.map((collection) => (
                  <ContextMenu.Item key={collection.id} className="hover:bg-neutral-700 px-4 py-3 focus:outline-none focus:ring-0 focus:ring-transparent rounded cursor-pointer">
                    <AddToCollectionButton
                      bookId={book.id}
                      collectionId={collection.id}
                      collectionName={collection.name}
                    />
                  </ContextMenu.Item>
                ))
              ) : (
                <ContextMenu.Item
                  disabled
                  className="px-4 py-3 text-neutral-500"
                >
                  No hay colecciones
                </ContextMenu.Item>
              )}
            </ContextMenu.SubContent>
          </ContextMenu.Sub>

          <ContextMenu.Separator className="borde border-b border-neutral-700 my-0.5" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-3 rounded flex items-center justify-between cursor-pointer">
              <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
                <FiShare2 className="text-white" size={20} />
                <p className="truncate w-full">Share</p>
              </button>
              <ChevronRightIcon />
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent className="bg-neutral-800 focus:outline-none focus:ring-0 focus:ring-transparent border border-transparent rounded-md shadow-lg p-1 text-white">
              <ContextMenu.Item className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-2 rounded cursor-pointer">
                <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
                  <CopyIcon className="text-white" size={20} />
                  <p className="truncate w-full">Copy link to book</p>
                </button>
              </ContextMenu.Item>
                <ContextMenu.Item className="hover:bg-neutral-700 focus:outline-none focus:ring-0 focus:ring-transparent px-4 py-2 rounded cursor-pointer">
                <button className={twMerge("flex flex-row h-auto items-center text-left w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1")}>
                  <MailIcon className="text-white" size={20} />
                  <p className="truncate w-full">Send to email</p>
                </button>
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Sub>

        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default BookContextMenu;
