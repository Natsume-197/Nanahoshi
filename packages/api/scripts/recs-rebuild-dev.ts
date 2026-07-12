// Dev utility: run the recommendations rebuild for every org against the DB
// in apps/server/.env, twice (second run should skip via fingerprints).
//   cd apps/server && bun run ../../packages/api/scripts/recs-rebuild-dev.ts [--full]

import { pool } from "@nanahoshi-v2/db";
import { runMigrations } from "@nanahoshi-v2/db/migrate";
import { rebuildServer } from "../src/modules/recommendations/rebuild.service";
import { recommendationComputeRepository } from "../src/modules/recommendations/recommendation-compute.repository";

const full = process.argv.includes("--full");

await runMigrations();
const orgIds = await recommendationComputeRepository.listOrganizationIds();
console.log("orgs:", orgIds);

for (const pass of [1, 2]) {
	console.log(
		`--- pass ${pass}${pass === 2 ? " (fingerprint skip expected)" : ""} ---`,
	);
	for (const serverId of orgIds) {
		const t0 = performance.now();
		const result = await rebuildServer(serverId, { full: full && pass === 1 });
		console.log(
			serverId,
			`${((performance.now() - t0) / 1000).toFixed(1)}s`,
			JSON.stringify(result),
		);
	}
}

await pool.end();
process.exit(0);
