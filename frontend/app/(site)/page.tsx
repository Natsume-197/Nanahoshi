import getBooks from "@/actions/getBooks";
import ListItem from "@/components/book/ListItem";
import PageContent from "./components/PageContent";
import getCollectionsByUserId from "@/actions/getCollectionsByUserId";
import PageContentAudiobook from "./components/PageContentAudiobook";
import getSeriesWithCovers from "@/actions/getSeriesWithBooks";
import getRandomBooks from "@/actions/getRandomBooks";
import PageContentSeries from "./components/PageContentSeries";

export const revalidate = 0;

export default async function Home() {
  const [books, randomBooks, userCollections, bookSeries] = await Promise.all([
    getBooks(),
    getRandomBooks(),
    getCollectionsByUserId(),
    getSeriesWithCovers()
  ]);

  return (
    <div className="relative rounded-lg h-full w-full overflow-y-auto bg-neutral-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-cyan-800/50 via-neutral-900/90 to-neutral-900" />

      <div className="relative z-10  px-6 py-6 space-y-12">

        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <ListItem image="/images/liked.png" name="Liked Books" href="liked" />
          </div>
        </section>

        <section>
          <h2 className="text-white text-2xl font-semibold mb-4">Recently Added Books</h2>
          <PageContent books={books} collections={userCollections} />
        </section>

        <section>
          <h2 className="text-white text-2xl font-semibold mb-4">Latest Series</h2>
          <PageContentSeries series={bookSeries} />
        </section>

        <section>
          <h2 className="text-white text-2xl font-semibold mb-4">Random Books</h2>
          <PageContent books={randomBooks} collections={userCollections} />
        </section>

        <section>
          <h2 className="text-white text-2xl font-semibold mb-4">Recently Added Audiobooks</h2>
          <PageContentAudiobook books={books} collections={userCollections} />
        </section>
        
      </div>
    </div>
  );
}
