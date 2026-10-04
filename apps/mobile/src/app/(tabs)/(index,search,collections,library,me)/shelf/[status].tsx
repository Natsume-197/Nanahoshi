import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { isShelfStatus } from "@/lib/shelves";
import { ShelfTitles, shelfTitle } from "@/screens/browse/title-lists";

export default function ShelfRoute() {
	const { status, format } = useLocalSearchParams<{
		status: string;
		format?: string;
	}>();
	if (!isShelfStatus(status)) return <Redirect href="/collections" />;
	const shelfFormat =
		format === "audiobook" || format === "ebook" ? format : "all";
	return (
		<>
			<Stack.Screen options={{ title: shelfTitle(status, shelfFormat) }} />
			<ShelfTitles
				key={`${status}-${shelfFormat}`}
				status={status}
				format={shelfFormat}
			/>
		</>
	);
}
