import type { ConfigContext, ExpoConfig } from "expo/config";

/** `APP_VARIANT=development` builds a second app (own package id, name and
 * URL scheme) that installs beside the production one. */
export function applyAppVariant(
	config: ExpoConfig,
	variant: string | undefined,
): ExpoConfig {
	if (variant !== "development") return config;
	return {
		...config,
		name: `${config.name} Dev`,
		slug: `${config.slug}-dev`,
		scheme: `${config.scheme}-dev`,
		ios: {
			...config.ios,
			bundleIdentifier: `${config.ios?.bundleIdentifier}.dev`,
		},
		android: {
			...config.android,
			package: `${config.android?.package}.dev`,
			adaptiveIcon: {
				...config.android?.adaptiveIcon,
				backgroundColor: "#8a3b12",
			},
		},
	};
}

export default ({ config }: ConfigContext): ExpoConfig =>
	applyAppVariant(config as ExpoConfig, process.env.APP_VARIANT);
