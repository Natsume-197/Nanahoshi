import { useEffect, useState } from 'react'


// useDebounce hook - we don't wana fetch our books on every single i/p we type(as each type we type the event is triggered), so we can use this and once the user stops typing it will delay for 500 ms and then fetch the result.
// this code is from the ref of "useHooks-ts" documentation. 
function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 500) // get result after 500ms from user being stopped typing

    return () => {
      clearTimeout(timer) // so there's no overflow.
    }
  }, [value, delay])

  return debouncedValue
}

export default useDebounce
// now we can use this hook in our search I/p comp