import { Platform } from "react-native";

/** Android gets the native ripple for press feedback; iOS keeps the
 * highlight fill. Rows use `pressed && !IS_ANDROID` for their fill. */
export const IS_ANDROID = process.env.EXPO_OS === "android";

/** iOS 26+ draws the mini player in the tab bar's own glass accessory. */
export const HAS_TAB_ACCESSORY =
	process.env.EXPO_OS === "ios" &&
	Number.parseInt(String(Platform.Version), 10) >= 26;
