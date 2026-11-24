import type {
	InstallBlock,
	UpdaterView,
} from "../../routers/updates/update.model";
import { isNewerVersion } from "./version";

/** The first thing standing between an admin and Install, or null. */
export function installBlockFor(input: {
	release: string;
	checkEnabled: boolean;
	updater: UpdaterView;
	available: boolean;
}): InstallBlock | null {
	const { updater, release } = input;
	if (release === "development") return "development";
	if (updater.state === "absent") return "updater-absent";
	if (updater.state === "stale") return "updater-stale";
	if (updater.state === "incompatible") return "updater-incompatible";
	if (updater.problem) return "updater-problem";
	if (updater.pinned) return "pinned";
	if (updater.phase !== "idle") return "busy";
	const staged =
		updater.stagedVersion !== null &&
		isNewerVersion(updater.stagedVersion, release);
	// Without the release check, the updater's own pull is the only way to know.
	if (input.checkEnabled && !input.available && !staged) return "no-update";
	return null;
}
