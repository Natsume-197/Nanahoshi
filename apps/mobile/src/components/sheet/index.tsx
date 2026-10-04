import {
	ModalBottomSheet,
	type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose";
import { type ReactNode, useRef } from "react";
import { sheetScrim, usePalette } from "@/theme";
import { DetachedHost } from "./detached-host";

/** Slides the sheet away, then runs `after` and `onClose`. */
export type SheetDismiss = (after?: () => void) => void;

export type SheetProps = {
	open?: boolean;
	/** Skip the half-height stop: for content that fits, which the half
	 * state cut under the gesture bar. */
	expanded?: boolean;
	color?: string;
	onClose: () => void;
	children: ReactNode | ((dismiss: SheetDismiss) => ReactNode);
};

/** The app's bottom sheet: Material's on Android, SwiftUI's on iOS. Mount it
 * outside native header views: a Compose host there never gets a window to
 * attach the sheet to. */
export function Sheet({
	open = true,
	expanded,
	color,
	onClose,
	children,
}: SheetProps) {
	const palette = usePalette();
	const sheet = useRef<ModalBottomSheetRef>(null);
	if (!open) return null;
	const dismiss: SheetDismiss = async (after) => {
		await sheet.current?.hide();
		after?.();
		onClose();
	};
	return (
		<DetachedHost>
			<ModalBottomSheet
				ref={sheet}
				onDismissRequest={onClose}
				skipPartiallyExpanded={expanded}
				containerColor={color ?? palette.card}
				contentColor={palette.text}
				scrimColor={sheetScrim}
			>
				{typeof children === "function" ? children(dismiss) : children}
			</ModalBottomSheet>
		</DetachedHost>
	);
}
