import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

/**
 * Everything that happens to a cover after it has been acquired: normalising it
 * into a Cover Master, reading its accent colour, and pre-rendering the warm
 * rungs of its ladder. It replaces the old cover-color/cover-warm pair, which
 * split one pipeline across two queues and made cache warming depend on colour
 * extraction having succeeded.
 */
export const coverIngestQueue = new Queue("cover-ingest", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
