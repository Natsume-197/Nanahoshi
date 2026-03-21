import { useState } from "react";
import { useReaderState, useReaderStats } from "@/context/reader-context";

export function CharacterCounter() {
	const [show, setShow] = useState(true);
	const { book } = useReaderState();
	const { currChars } = useReaderStats();

	const percentage =
		book.totalChars > 0
			? ((100 * currChars) / book.totalChars).toFixed(2)
			: "0.00";

	return (
		<span
			className="fixed right-2 bottom-2 z-10 cursor-pointer text-muted-foreground text-xs"
			onClick={() => setShow((prev) => !prev)}
			onKeyDown={() => {}}
		>
			{show ? (
				`${currChars}/${book.totalChars} (${percentage}%)`
			) : (
				<span className="opacity-20">Show counter</span>
			)}
		</span>
	);
}
