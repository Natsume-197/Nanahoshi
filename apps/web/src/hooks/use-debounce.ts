import { useRef, useState } from "react";

export function useDebounce<T>(value: T, delay?: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const prevValueRef = useRef(value);

	if (value !== prevValueRef.current) {
		prevValueRef.current = value;
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setDebouncedValue(value), delay ?? 500);
	}

	return debouncedValue;
}
