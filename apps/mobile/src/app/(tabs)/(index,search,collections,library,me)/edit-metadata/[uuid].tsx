import { useLocalSearchParams } from "expo-router";
import { EditMetadata } from "@/screens/detail/edit-metadata";

export default function EditMetadataRoute() {
	const { uuid, kind } = useLocalSearchParams<{
		uuid: string;
		kind?: string;
	}>();
	return (
		<EditMetadata
			key={uuid}
			uuid={uuid}
			kind={kind === "audiobook" ? "audiobook" : "book"}
		/>
	);
}
