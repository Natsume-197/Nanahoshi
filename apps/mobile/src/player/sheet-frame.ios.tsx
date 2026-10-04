import { BottomSheet } from "@expo/ui";
import type { ReactNode } from "react";

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
	return (
		<BottomSheet
			isPresented={open}
			onDismiss={onClose}
			containerColor={color}
			contentPadding={0}
		>
			{children(onClose)}
		</BottomSheet>
	);
}
