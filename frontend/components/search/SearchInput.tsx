"use client";

import qs from "query-string";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import useDebounce from "@/hooks/useDebounce"; 

import InputBeautiful from "@/components/misc/InputBeautiful";


// the search input component for the books(by title)
const SearchInput = () => {
  const router = useRouter();
  const [value, setValue] = useState<string>('');
  const debouncedValue = useDebounce<string>(value, 500); // the useDebounce hook - we don't wana fetch our books on every single i/p we type, so we can use this and once the user stops typing it will delay for 500 ms and then fetch the result.

  useEffect(() => {
    const query = {
      title: debouncedValue,
    };

    const url = qs.stringifyUrl({
      url: '/search',
      query
    });

    if(query.title == '') return

    router.push(url);
  }, [debouncedValue, router]);

  return ( 
    <InputBeautiful 
      placeholder="What do you want to read?"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
 
export default SearchInput;