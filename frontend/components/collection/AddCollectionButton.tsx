"use client";

import { useEffect, useState } from "react";
import { useSessionContext } from "@supabase/auth-helpers-react";
import { toast } from "react-hot-toast";
import { useUser } from "@/hooks/useUser";
import useAuthModal from "@/hooks/modals/useAuthModal";

interface AddToCollectionButtonProps {
  bookId: string;
  collectionId: string;
  collectionName: string;
}

const AddToCollectionButton: React.FC<AddToCollectionButtonProps> = ({
  bookId,
  collectionId,
  collectionName
}) => {
  const { supabaseClient } = useSessionContext();
  const { user } = useUser();
  const authModal = useAuthModal();
  const [isInCollection, setIsInCollection] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const checkCollection = async () => {
      const { data, error } = await supabaseClient
        .from('collection_books')
        .select('*')
        .eq('collection_id', collectionId)
        .eq('book_id', bookId)
        .single();

      if (!error && data) {
        setIsInCollection(true);
      }
    };

    checkCollection();
  }, [bookId, collectionId, user?.id, supabaseClient]);

  const toggle = async () => {
    if (!user) return authModal.onOpen();

    if (isInCollection) {
      const { error } = await supabaseClient
        .from('collection_books')
        .delete()
        .eq('collection_id', collectionId)
        .eq('book_id', bookId);

      if (error) {
        toast.error("No se pudo quitar");
      } else {
        setIsInCollection(false);
        toast.success("Quitado de la colección");
      }
    } else {
      const { error } = await supabaseClient
        .from('collection_books')
        .insert({
          book_id: bookId,
          collection_id: collectionId
        });

      if (error) {
        toast.error("Error al añadir");
      } else {
        setIsInCollection(true);
        toast.success("Añadido a la colección");
      }
    }
  };

  return (
    <button
      className="flex flex-row h-auto items-center w-full gap-x-2 text-md font-medium cursor-pointer transition text-white py-1"
      onClick={toggle}
    >
      <div className="flex"> {isInCollection ? "-" : "+"}</div> {collectionName}
    </button>

  );
};

export default AddToCollectionButton;
