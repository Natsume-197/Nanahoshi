import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CategorySelector } from "@/components/shared/category-selector";
import { m } from "@/paraglide/messages";

export type CatalogSection = "books" | "audiobooks";

const catalogSections = [
	{ value: "books", label: m["nav.books"], to: "/dashboard/books" },
	{
		value: "audiobooks",
		label: m["nav.audiobooks"],
		to: "/dashboard/audiobooks",
	},
] as const satisfies readonly {
	value: CatalogSection;
	label: () => string;
	to: "/dashboard/books" | "/dashboard/audiobooks";
}[];

export function CatalogPage({
	section,
	children,
}: {
	section: CatalogSection;
	children: ReactNode;
}) {
	const navigate = useNavigate();
	const handleSectionChange = (value: CatalogSection) => {
		const next = catalogSections.find((item) => item.value === value);
		if (next) void navigate({ to: next.to });
	};

	return (
		<>
			<CategorySelector
				value={section}
				items={catalogSections}
				onValueChange={handleSectionChange}
				ariaLabel={m["nav.catalog"]()}
			/>
			{children}
		</>
	);
}
