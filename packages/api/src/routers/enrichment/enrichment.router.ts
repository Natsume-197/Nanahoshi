import { requirePermission } from "../../index";
import {
	ApproveEnrichmentInput,
	EnrichmentDetailInput,
	ListEnrichmentInput,
	RetryEnrichmentInput,
} from "./enrichment.model";
import { enrichmentService } from "./enrichment.service";

// Match manager: the same permission that gates library enrich/scan actions.
export const enrichmentRouter = {
	list: requirePermission("library", "scan")
		.input(ListEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.list(context.serverId, input);
		}),

	detail: requirePermission("library", "scan")
		.input(EnrichmentDetailInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.detail(context.serverId, input.bookUuid);
		}),

	providerStatus: requirePermission("library", "scan").handler(async () => {
		return enrichmentService.providerStatus();
	}),

	retry: requirePermission("library", "scan")
		.input(RetryEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.retry(context.serverId, input);
		}),

	approve: requirePermission("library", "scan")
		.input(ApproveEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.approve(context.serverId, input.bookUuids);
		}),
};
