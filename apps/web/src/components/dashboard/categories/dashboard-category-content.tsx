import { useQuery } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { CategorySelector } from "@/components/shared/category-selector";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { MediaCategoryContent } from "./media-category-content";

type DashboardCategory = "home" | "books" | "audiobooks";
const DASHBOARD_CATEGORY_STORAGE_KEY = "nanahoshi-dashboard-category";

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
	useIsomorphicLayoutEffect(() => {
		try {
			const stored = window.localStorage.getItem(
				DASHBOARD_CATEGORY_STORAGE_KEY,
			);
			if (stored === "home" || stored === "books" || stored === "audiobooks") {
				setCategory(stored);
			}
		} catch {
			// Storage can be unavailable in private mode.
		}
	}, []);
	const selectCategory = (next: DashboardCategory) => {
		setCategory(next);
		try {
			window.localStorage.setItem(DASHBOARD_CATEGORY_STORAGE_KEY, next);
		} catch {
			// The current visit still remembers the selection in component state.
		}
	};

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
					onValueChange={selectCategory}
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
