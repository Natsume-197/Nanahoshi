"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/hooks/useUser";
import Button from "@/components/misc/Button";
import { AiOutlinePlus } from "react-icons/ai";
//import useSubscribeModal from "@/hooks/useSubscribeModal";
//import { postData } from "@/libs/helpers";
import useAddLibraryModal from "@/hooks/modals/useAddLibraryModal";

// the subsribed user's account page's content
const AccountContent = () => {
  const router = useRouter();

  const AddLibraryModal = useAddLibraryModal();


  //const subscribeModal = useSubscribeModal();
  const { isLoading, subscription, user } = useUser();
    
  // const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  const openAddLibraryModal = () => {
    return AddLibraryModal.onOpen();
  }

  return ( 
    <div className="mb-7 px-6">
        <div className="flex text-white flex-col gap-y-4">
        <Button onClick={openAddLibraryModal}
          className="w-[250px]"
        >
          Add library
        </Button>
      </div>
    </div>
  );
}
 
export default AccountContent;