// Type-check the app. `AppRouter` is imported (types only) from
// @nanahoshi/api, which pulls the server's source into this program; under
// React Native's globals a few server-only lines (timer `.unref()`, Node's
// ProcessEnv) don't type-check. Those files never reach the bundle and are
// checked by their own package, so only errors in this app fail the check.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
	encoding: "utf8",
	shell: true,
});
// A missing compiler prints no diagnostics; never read that as a clean check.
if (
	result.status !== 0 &&
	!/error TS/.test(`${result.stdout}${result.stderr}`)
) {
	console.error(`${result.stdout}${result.stderr}`);
	console.error("apps/mobile: tsc did not run");
	process.exit(1);
}
const lines = `${result.stdout}${result.stderr}`.split("\n");
const ownErrors = [];
let current = null;
for (const line of lines) {
	if (/^\S.*\(\d+,\d+\): error TS/.test(line)) {
		current = line.startsWith("../") ? null : [line];
		if (current) ownErrors.push(current);
	} else if (current && line.trim()) {
		current.push(line);
	}
}
for (const error of ownErrors) console.error(error.join("\n"));
if (ownErrors.length > 0) {
	console.error(`\n${ownErrors.length} type error(s) in apps/mobile`);
	process.exit(1);
}
console.log("apps/mobile: no type errors");
