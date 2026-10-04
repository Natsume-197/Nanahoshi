import { Host } from "@expo/ui";
import {
	ModalBottomSheet,
	type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose";
import { type ReactNode, useRef } from "react";

/**
 * The Material sheet the player's speed and sleep open in. Always fully
 * expanded: its content fits, and the half state cut the last row under the
 * gesture bar.
 */
export function SheetFrame({
	open,
	color,
	onClose,
	children,
}: {
	open: boolean;
	color: string;
	onClose: () => void;
	/** Gets `close`, which slides the sheet away before `onClose`. */
	children: (close: () => void) => ReactNode;
}) {
	const sheet = useRef<ModalBottomSheetRef>(null);
	if (!open) return null;
	const close = async () => {
		await sheet.current?.hide();
		onClose();
	};
	return (
		<Host style={{ position: "absolute", width: 1, height: 1 }}>
			<ModalBottomSheet
				ref={sheet}
				onDismissRequest={onClose}
				skipPartiallyExpanded
				containerColor={color}
			>
				{children(() => void close())}
			</ModalBottomSheet>
		</Host>
	);
}
