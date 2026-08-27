import { type JSX, useState } from "react";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { CategorySelector } from "@/components/shared/category-selector";
import { m } from "@/paraglide/messages";
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

	return (
		<>
			<CategorySelector
				value={category}
				items={categories}
				onValueChange={setCategory}
				ariaLabel={m["nav.library"]()}
			/>

			{category === "home" ? (
				<DashboardHomeContent compactTop />
			) : (
				<MediaCategoryContent category={category} />
			)}
		</>
	);
}
