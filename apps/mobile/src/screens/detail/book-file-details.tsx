import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { DetailPanel } from "@/components/detail-panel";
import { PanelSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import type { ApiClient } from "@/lib/api";
import { locale, t } from "@/lib/i18n";
import { htmlToText } from "@/lib/plain-text";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";

export type BookDetailData = Awaited<
	ReturnType<ApiClient["books"]["getBookWithMetadata"]>
>;

export function bookDate(value: string | null | undefined) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleDateString(locale, { timeZone: "UTC" });
}

const metadataLabels: Record<string, string> = {
	title: "book.meta_title",
	subtitle: "book.meta_subtitle",
	description: "book.meta_description",
	authors: "book.authors",
	publisher: "book.publisher",
	publishedDate: "book.meta_published_date",
	languageCode: "book.language",
	pageCount: "book.meta_page_count",
	isbn10: "ISBN-10",
	isbn13: "ISBN-13",
	asin: "ASIN",
	amountChars: "book.characters",
};

export function BookFileDetails({ book }: { book: BookDetailData }) {
	const { orpc } = useApi();
	const original = useQuery(
		orpc.books.getOriginalMetadata.queryOptions({
			input: { uuid: book.uuid },
			staleTime: 60_000,
		}),
	);
	const rows = Object.entries(metadataLabels).flatMap(([key, label]) => {
		const value = (original.data as Record<string, unknown> | null)?.[key];
		if (value == null || value === "") return [];
		const named = (item: unknown): string =>
			typeof item === "object" && item !== null && "name" in item
				? String(item.name)
				: String(item);
		const text = Array.isArray(value)
			? value.map(named).join(", ")
			: named(value);
		return [
			{
				label: t(label),
				value: key === "description" ? htmlToText(text) : text,
			},
		];
	});
	return (
		<View style={{ gap: space.xxl }}>
			<DetailPanel
				title={t("book.section_file_info")}
				rows={[
					{ label: t("book.filename"), value: book.filename },
					{
						label: t("book.format"),
						value: book.filename.split(".").pop()?.toUpperCase() ?? "—",
					},
					book.filesizeKb != null
						? {
								label: t("book.size"),
								value: `${(book.filesizeKb / 1024).toFixed(1)} MB`,
							}
						: null,
					{ label: t("book.added"), value: bookDate(book.createdAt) },
					book.lastModified
						? { label: t("book.modified"), value: bookDate(book.lastModified) }
						: null,
				]}
			/>
			{original.isPending ? (
				<PanelSkeleton rows={6} />
			) : original.isError ? (
				<ErrorState onRetry={() => original.refetch()} />
			) : (
				<DetailPanel title={t("book.section_original_metadata")} rows={rows} />
			)}
		</View>
	);
}
