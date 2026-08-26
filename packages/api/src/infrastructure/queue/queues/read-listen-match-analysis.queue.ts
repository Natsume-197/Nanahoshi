import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const readListenMatchAnalysisQueue = new Queue(
	"read-listen-match-analysis",
	{
		connection: redis,
		defaultJobOptions: { ...JOB_RETENTION },
	},
);
