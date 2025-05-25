import getBooksByTitle from "@/actions/getBooksByTitle";

import SearchContent from "./components/SearchContent";

export const revalidate = 0; // no cache

// lets impl the search functionality (by book title)
interface SearchProps {
  searchParams: Promise<{ title: string }>
};

const Search = async (props: SearchProps) => {
  const searchParams = await props.searchParams;
  const books = await getBooksByTitle(searchParams.title);

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
        <div className=" flex flex-col gap-y-6">
          <h1 className="text-white text-3xl font-semibold">
            Search Results
          </h1>
        </div>
      <SearchContent books={books} />
    </div>
  );
}

export default Search;