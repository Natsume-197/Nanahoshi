import { useLocalSearchParams } from "expo-router";
import { CoverViewer } from "@/screens/cover-viewer";

export default function CoverRoute() {
	const { cover, shape } = useLocalSearchParams<{
		cover: string;
		shape?: string;
	}>();
	return (
		<CoverViewer cover={cover} shape={shape === "audio" ? "audio" : "book"} />
	);
}
