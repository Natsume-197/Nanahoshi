"use client";

import { AiOutlinePlus } from "react-icons/ai";

//import { Book } from "@/types";
import useUploadModal from "@/hooks/modals/useUploadModal";
import { useUser } from "@/hooks/useUser";
import useAuthModal from "@/hooks/modals/useAuthModal";
//import useSubscribeModal from "@/hooks/useSubscribeModal";
import { BookWithFormats, Collection } from "@/types";
import { BiBookContent } from "react-icons/bi";
import useCreateCollectionModal from "@/hooks/modals/useCreateCollectionModal";
import CollectionItem from "../collection/CollectionItem";
import { useRouter } from 'next/navigation';

// the book library component
interface LibraryProps {
  books: BookWithFormats[];
  collections: Collection[];
}

const Library: React.FC<LibraryProps> = ({
 collections
}) => {
  const { user, subscription } = useUser();
  const uploadModal = useUploadModal();
  const authModal = useAuthModal()
  const createCollectionModal = useCreateCollectionModal();
  const router = useRouter();

  //const subscribeModal = useSubscribeModal();

  //const onPlay = useOnPlay(books);

  // opens the upload modal, if user not logged in then opens the auth modal, if he doesn't ve subscribed then opens the subscribe modal.
  const onClick = () => {
    if (!user) {
      return authModal.onOpen();
    }

    //before upload, check if user is subscribed
    if (!subscription) {
      //return subscribeModal.onOpen();
    }

    return uploadModal.onOpen();
  }
  const handleCollectionClick = (collection: Collection) => {
    router.push(`/collections/${collection.id}`);
  }

  const onClick2 = () => {
    if (!user) {
      return authModal.onOpen();
    }

    return createCollectionModal.onOpen();
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="inline-flex items-center gap-x-2">
          <BiBookContent className="text-neutral-400" size={26} />
          <p className="text-neutral-400 font-medium text-md">Your Collections</p>
        </div>
        <AiOutlinePlus className="text-neutral-400 cursor-pointer hover:text-white transition" size={20} onClick={onClick2} />

      </div>
      <div className="flex flex-col gap-y-2 mt-4 px-3">
        {collections.map((item) => (
          <CollectionItem
            onClick={() => handleCollectionClick(item)}
            key={item.id}
            data={item}
          />
        ))}
      </div>
    </div>
  );
}

export default Library;