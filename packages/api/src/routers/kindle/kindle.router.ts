import { z } from "zod";
import { BadRequestError } from "../../errors";
import { orgProcedure } from "../../index";
import { sendToKindleQueue } from "../../infrastructure/queue/queues/send-to-kindle.queue";
import { redis } from "../../infrastructure/queue/redis";
import { createTask } from "../../modules/taskManager";

const KINDLE_EMAIL_DOMAINS = new Set([
	"kindle.com",
	"kindle.cn",
	"kindle.co.jp",
	"free.kindle.com",
	"kindle.co.uk",
]);

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 3600; // 1 hour

export const kindleRouter = {
	sendToKindle: orgProcedure
		.input(
			z.object({
				bookUuid: z.string(),
				kindleEmail: z.string().email(),
			}),
		)
		.handler(async ({ input, context }) => {
			// Validate Kindle email domain
			const domain = input.kindleEmail.split("@")[1]?.toLowerCase();
			if (!domain || !KINDLE_EMAIL_DOMAINS.has(domain)) {
				throw new BadRequestError(
					"Email must be a Kindle address (e.g. name@kindle.com)",
				);
			}

			// Rate limit per user: max 10 sends per hour
			const rateLimitKey = `kindle-rate:${context.session.user.id}`;
			const current = await redis.incr(rateLimitKey);
			if (current === 1) {
				await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
			}
			if (current > RATE_LIMIT_MAX) {
				throw new BadRequestError(
					"Too many Send to Kindle requests. Please wait before trying again.",
				);
			}

			const task = await createTask({
				type: "send-to-kindle",
				label: `Sending to ${input.kindleEmail}`,
				totalJobs: 1,
				sealed: true,
				queue: "send-to-kindle",
			});

			await sendToKindleQueue.add("send-to-kindle", {
				bookUuid: input.bookUuid,
				kindleEmail: input.kindleEmail,
				organizationId: context.organizationId,
				taskId: task.id,
			});

			return { success: true };
		}),
};
