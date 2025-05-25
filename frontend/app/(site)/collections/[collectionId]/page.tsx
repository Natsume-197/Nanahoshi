
import Image from "next/image";
import getBooksByCollectionId from "@/actions/getBooksByCollectionId";
import CollectionContent from "../components/CollectionContent";

type Params = Promise<{ collectionId: string }>;

export const revalidate = 0;

const CollectionPage =  async ({ params }: { params: Params }) => {
  const { collectionId } = await params; 
  const books = await getBooksByCollectionId(collectionId);
  return (
    <div className="bg-neutral-900 rounded-lg h-full w-full overflow-hidden overflow-y-auto">
        <div className="mt-20">
          <div className="flex flex-col md:flex-row items-center gap-x-5">
            <div className="relative h-32 w-32 lg:h-44 lg:w-44">
              <Image
                className="object-cover"
                fill
                src="/images/collection_placeholder.png"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                alt="Playlist"
              />
            </div>
            <div className="flex flex-col gap-y-2 mt-4 md:mt-0">
              <p className="hidden md:block font-semibold text-white text-sm">Collection</p>
              <h1 className="text-white text-4xl sm:text-5xl lg:text-7xl font-bold">
                {books[0].name} 
              </h1>
            </div>
          </div>
        </div>
      <CollectionContent collectionWithBooks={books} />
    </div>
  );
};

export default CollectionPage;
