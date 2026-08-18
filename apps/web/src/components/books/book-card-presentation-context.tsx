import { createContext, type ReactNode, useContext } from "react";

export type BookCardPresentation = "classic" | "showcase";

const BookCardPresentationContext =
	createContext<BookCardPresentation>("classic");

export function BookCardPresentationProvider({
	value,
	children,
}: {
	value: BookCardPresentation;
	children: ReactNode;
}) {
	return (
		<BookCardPresentationContext value={value}>
			{children}
		</BookCardPresentationContext>
	);
}

export function useBookCardPresentation(): BookCardPresentation {
	return useContext(BookCardPresentationContext);
}
