"use client";

import { useEffect, useRef, useState } from "react";
import useDebounce from "@/hooks/useDebounce";
import getBooksByTitle from "@/actions/getBooksByTitle";
import { BookWithFormats } from "@/types";
import MediaItem from "./MediaItem";

const FloatingSearchBar = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookWithFormats[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      if (debouncedQuery.trim().length === 0) {
        setResults([]);
        return;
      }

      const books = await getBooksByTitle(debouncedQuery);
      setResults(books);
      setShowDropdown(true);
    };

    fetchBooks();
  }, [debouncedQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <input
        type="text"
        value={query}
        placeholder="What do you want to read?"
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-full bg-neutral-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        onFocus={() => {
          if (results.length > 0) setShowDropdown(true);
        }}
      />

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.map((book) => (
            <div key={book.id} className="p-2 hover:bg-neutral-800">
              <MediaItem data={book} onClick={(id) => window.location.href = `/book/${id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FloatingSearchBar;
