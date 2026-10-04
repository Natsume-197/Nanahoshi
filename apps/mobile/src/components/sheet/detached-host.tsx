import { Host } from "@expo/ui";
import type { ReactNode } from "react";

/** A 1×1 Compose host for content that draws in its own window (sheets,
 * dialogs): a full-size one would swallow every touch under it. */
export function DetachedHost({ children }: { children: ReactNode }) {
	return (
		<Host style={{ position: "absolute", width: 1, height: 1 }}>
			{children}
		</Host>
	);
}
