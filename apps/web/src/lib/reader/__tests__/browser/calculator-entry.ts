// Entry bundled to an IIFE and injected into the harness page so the real
// CharacterStatsCalculator can be exercised over live browser layout. Not a
// `*.test.ts` file — it is bundled by run.browser.ts, never run by `bun test`.
import { CharacterStatsCalculator } from "../../character-stats-calculator";

(globalThis as unknown as Record<string, unknown>).CharacterStatsCalculator =
	CharacterStatsCalculator;
