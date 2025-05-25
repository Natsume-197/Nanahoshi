import getBookById from "@/actions/getBookById";
import BookHeader from "../components/BookHeader";
import BookContent from "../components/BookContent";

type Params = Promise<{ bookId: string }>;

export const revalidate = 0;

const BookPage = async ({ params }: { params: Params }) => {
  const { bookId } = await params; 
  const book = await getBookById(bookId);

  if (!book) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-400 text-lg p-6">
        Libro no encontrado.
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 rounded-lg h-full w-full overflow-hidden overflow-y-auto">
      <BookHeader book={book} />
      <div className="mt-2 mb-7 px-6">
        <div className="flex justify-between items-center">
          <h1 className="text-white text-2xl font-semibold">
            Related
          </h1>
        </div>
        <div>
        <BookContent books={book.series ? book.series.books : []} />
        </div>
      </div>
    </div>
  );
};

export default BookPage;
