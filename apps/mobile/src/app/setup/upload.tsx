import { useLocalSearchParams } from "expo-router";
import { UploadBooks } from "@/screens/setup/upload-books";

export default function UploadRoute() {
	const { library } = useLocalSearchParams<{ library?: string }>();
	return <UploadBooks libraryUuid={library} />;
}
