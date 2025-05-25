"use client";

import { useEffect, useState } from "react";

import AuthModal from "@/components/modal/AuthModal";
import UploadModal from "@/components/modal/UploadModal";
import CreateCollectionModal from "@/components/modal/CreateCollectionModal";
import AddLibraryModal from "@/components/modal/AddLibraryModal";
//import SubscribeModal from "@/components/SubscribeModal";
//import UploadModal from "@/components/UploadModal";
//import { ProductWithPrice } from "@/types";

const ModalProvider: React.FC = ({
}) => {
  const [isMounted, setIsMounted] = useState(false);

  // we don't wana render the modal in the server side. so if this useEffect loads then we re on the client side and safe to load our modal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <AuthModal />
      <UploadModal/>
      <CreateCollectionModal/>
      <AddLibraryModal/>
    </>
  );
}

export default ModalProvider;