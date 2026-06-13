import { createFileRoute } from "@tanstack/react-router";
import { MetadataSourcesSettings } from "@/components/settings/sections/metadata-sources";

export const Route = createFileRoute(
	"/dashboard/settings/addons/metadata-sources",
)({
	component: MetadataSourcesSettings,
});
