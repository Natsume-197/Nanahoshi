import { RNHostView } from "@expo/ui";
import { router } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreateCollection, EditCollection } from "@/screens/collections/create";
import { SendToKindle } from "@/screens/detail/send-to-kindle";
import { Sheet } from "../sheet";
import {
	closeFormSheet,
	FormSheetContext,
	type FormSheetTarget,
	useFormSheetTarget,
} from "./open";

/** Mounts the open form in the app's Material sheet. Mount once. */
export function FormSheetHost() {
	const target = useFormSheetTarget();
	if (!target) return null;
	return <FormSheet key={JSON.stringify(target)} target={target} />;
}

function FormSheet({ target }: { target: FormSheetTarget }) {
	const { width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	return (
		<Sheet expanded onClose={closeFormSheet}>
			{(dismiss) => (
				<FormSheetContext
					value={{
						embedded: true,
						// Let the sheet slide away before the next page opens.
						finish: (next) =>
							dismiss(next ? () => router.push(next) : undefined),
					}}
				>
					{/* Hosted, not bare: RN views set straight into the Compose sheet
					    drew but never received a press. */}
					<RNHostView matchContents>
						<View style={{ width, paddingBottom: insets.bottom }}>
							<Form target={target} />
						</View>
					</RNHostView>
				</FormSheetContext>
			)}
		</Sheet>
	);
}

function Form({ target }: { target: FormSheetTarget }) {
	switch (target.form) {
		case "newCollection":
			return <CreateCollection />;
		case "editCollection":
			return <EditCollection id={target.id} />;
		case "kindle":
			return <SendToKindle uuid={target.uuid} />;
	}
}
