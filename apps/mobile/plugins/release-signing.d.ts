import type { ConfigPlugin } from "expo/config-plugins";

declare const withReleaseSigning: ConfigPlugin & {
	addReleaseSigning(gradle: string): string;
};
export = withReleaseSigning;
