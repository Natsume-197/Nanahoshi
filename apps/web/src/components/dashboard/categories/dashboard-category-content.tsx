import { useQuery } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { CategorySelector } from "@/components/shared/category-selector";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { MediaCategoryContent } from "./media-category-content";

type DashboardCategory = "home" | "books" | "audiobooks";

const categories = [
	{ value: "home", label: m["nav.home"] },
	{ value: "books", label: m["nav.books"] },
	{ value: "audiobooks", label: m["nav.audiobooks"] },
] as const satisfies readonly {
	value: DashboardCategory;
	label: () => string;
}[];

export function DashboardCategoryContent(): JSX.Element {
	const [category, setCategory] = useState<DashboardCategory>("home");

	const { data: libraries } = useQuery(
		orpc.libraries.getLibraries.queryOptions(),
	);
	const availableCategories = categories.filter(
		({ value }) =>
			value === "home" ||
			libraries?.some(
				(library) =>
					library.mediaType === (value === "books" ? "ebook" : "audiobook"),
			),
	);
	const activeCategory = availableCategories.some(
		({ value }) => value === category,
	)
		? category
		: "home";

	return (
		<>
			{availableCategories.length > 1 && (
				<CategorySelector
					value={activeCategory}
					items={availableCategories}
					onValueChange={setCategory}
					ariaLabel={m["nav.library"]()}
				/>
			)}

			{activeCategory === "home" ? (
				<DashboardHomeContent compactTop={availableCategories.length > 1} />
			) : (
				<MediaCategoryContent category={activeCategory} />
			)}
		</>
	);
}
