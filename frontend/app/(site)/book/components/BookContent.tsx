"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BookWithFormats } from "@/types";
import { useUser } from "@/hooks/useUser";
import PageContent from "@/app/(site)/components/PageContent";

interface BookContentProps {
  books: BookWithFormats[];
}

const BookContent: React.FC<BookContentProps> = ({
  books
}) => {
  const router = useRouter();
  const { isLoading, user } = useUser();

  useEffect(() => {
    if (!isLoading && !user) { //if not logged in then redirect to home
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (books.length === 0) {
    return (
      <div
        className="
          flex 
          flex-col 
          gap-y-2 
          w-full px-6 
          text-neutral-400
        "
      >
        No books.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-y-2 w-full p-6">
      <PageContent books={books} collections={[]} />
    </div>
  );
}

export default BookContent;