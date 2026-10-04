import { BottomSheet } from "@expo/ui";
import { usePalette } from "@/theme";
import type { SheetDismiss, SheetProps } from "./index";

export type { SheetDismiss, SheetProps } from "./index";

export function Sheet({ open = true, color, onClose, children }: SheetProps) {
	const palette = usePalette();
	const dismiss: SheetDismiss = (after) => {
		after?.();
		onClose();
	};
	return (
		<BottomSheet
			isPresented={open}
			onDismiss={onClose}
			containerColor={color ?? palette.sheet}
			contentPadding={0}
		>
			{typeof children === "function" ? children(dismiss) : children}
		</BottomSheet>
	);
}
