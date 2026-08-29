import { requirePermission } from "../../index";
import {
	ActionableCountsInput,
	ApproveEnrichmentInput,
	EnrichmentDetailInput,
	ListEnrichmentInput,
	ProviderStatusInput,
	ResolveProviderFailuresInput,
	RetryEnrichmentInput,
	TargetSelection,
} from "./enrichment.model";
import { enrichmentService } from "./enrichment.service";

// Match manager: the same permission that gates library enrich/scan actions.
export const enrichmentRouter = {
	list: requirePermission("library", "scan")
		.input(ListEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.list(context.serverId, input);
		}),

	actionableCounts: requirePermission("library", "scan")
		.input(ActionableCountsInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.actionableCounts(context.serverId, input);
		}),

	detail: requirePermission("library", "scan")
		.input(EnrichmentDetailInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.detail(context.serverId, input.bookUuid);
		}),

	providerStatus: requirePermission("library", "scan")
		.input(ProviderStatusInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.providerStatus(
				context.serverId,
				input.libraryUuid,
			);
		}),

	resolveProviderFailures: requirePermission("library", "scan")
		.input(ResolveProviderFailuresInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.resolveProviderFailures(context.serverId, input);
		}),

	retry: requirePermission("library", "scan")
		.input(RetryEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.retry(context.serverId, input);
		}),

	cancelRetry: requirePermission("library", "scan")
		.input(TargetSelection)
		.handler(async ({ input, context }) => {
			return enrichmentService.cancelRetry(context.serverId, input);
		}),

	restoreOriginal: requirePermission("library", "scan")
		.input(TargetSelection)
		.handler(async ({ input, context }) => {
			return enrichmentService.restoreOriginal(context.serverId, input);
		}),

	approve: requirePermission("library", "scan")
		.input(ApproveEnrichmentInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.approve(context.serverId, input);
		}),
};
