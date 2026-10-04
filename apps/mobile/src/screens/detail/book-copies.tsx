import { Link } from "expo-router";
import { View } from "react-native";
import { CoverArt, ResultRow } from "@/components/result-row";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { space } from "@/theme";
import type { BookDetailData } from "./book-file-details";

export function DuplicateNotice({ book }: { book: BookDetailData }) {
	if (!book.isDuplicate) return null;
	return (
		<View style={{ gap: space.sm }}>
			<Text variant="subhead" tone="secondary">
				{t("book.duplicate_notice")}
			</Text>
			{book.canonicalUuid ? (
				<Link href={routes.title("book", book.canonicalUuid)}>
					<Text>{t("book.view_main_edition")}</Text>
				</Link>
			) : null}
		</View>
	);
}

export function BookCopies({ book }: { book: BookDetailData }) {
	const copies = [book, ...(book.otherCopies ?? [])];
	return (
		<View style={{ gap: space.sm }}>
			{copies.map((copy) => (
				<ResultRow
					key={copy.uuid}
					href={
						copy.uuid === book.uuid
							? undefined
							: routes.title("book", copy.uuid)
					}
					artwork={<CoverArt cover={book.cover} color={book.mainColor} />}
					title={copy.title ?? book.title ?? copy.filename}
					subtitle={copy.filename}
					meta={[
						copy.filename.split(".").pop()?.toUpperCase(),
						copy.filesizeKb != null
							? `${(copy.filesizeKb / 1024).toFixed(1)} MB`
							: null,
						copy.uuid === book.uuid ? t("book.copy_current") : null,
					]
						.filter(Boolean)
						.join(" · ")}
				/>
			))}
		</View>
	);
}
