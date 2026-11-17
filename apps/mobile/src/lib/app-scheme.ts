import Constants from "expo-constants";

const scheme = Constants.expoConfig?.scheme;

/** The URL scheme of this build: `nanahoshi`, or `nanahoshi-dev` for the
 * development app. */
export const APP_SCHEME =
	(Array.isArray(scheme) ? scheme[0] : scheme) ?? "nanahoshi";
