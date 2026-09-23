import { requirePermission } from "../../index";
import { publishTrayChanged } from "../../modules/metadataEnrichment/tray.events";
import {
	ActionableCountsInput,
	ApproveEnrichmentInput,
	CandidatePreviewInput,
	EnrichmentDetailInput,
	ListEnrichmentInput,
	MatchPreviewInput,
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

	approvalPreview: requirePermission("library", "scan")
		.input(TargetSelection)
		.handler(async ({ input, context }) => {
			return enrichmentService.approvalPreview(context.serverId, input);
		}),

	detail: requirePermission("library", "scan")
		.input(EnrichmentDetailInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.detail(context.serverId, input.bookUuid);
		}),

	candidatePreview: requirePermission("library", "scan")
		.input(CandidatePreviewInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.candidatePreview(context.serverId, input);
		}),

	matchPreview: requirePermission("library", "scan")
		.input(MatchPreviewInput)
		.handler(async ({ input, context }) => {
			return enrichmentService.matchPreview(context.serverId, input.bookUuid);
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
			const result = await enrichmentService.resolveProviderFailures(
				context.serverId,
				input,
			);
			publishTrayChanged(context.serverId, "metadata");
			return result;
		}),

	retry: requirePermission("library", "scan")
		.input(RetryEnrichmentInput)
		.handler(async ({ input, context }) => {
			const result = await enrichmentService.retry(context.serverId, input);
			publishTrayChanged(context.serverId, "metadata");
			return result;
		}),

	cancelRetry: requirePermission("library", "scan")
		.input(TargetSelection)
		.handler(async ({ input, context }) => {
			const result = await enrichmentService.cancelRetry(
				context.serverId,
				input,
			);
			publishTrayChanged(context.serverId, "metadata");
			return result;
		}),

	restoreOriginal: requirePermission("library", "scan")
		.input(TargetSelection)
		.handler(async ({ input, context }) => {
			const result = await enrichmentService.restoreOriginal(
				context.serverId,
				input,
			);
			publishTrayChanged(context.serverId, "metadata");
			return result;
		}),

	approve: requirePermission("library", "scan")
		.input(ApproveEnrichmentInput)
		.handler(async ({ input, context }) => {
			const result = await enrichmentService.approve(context.serverId, input);
			publishTrayChanged(context.serverId, "metadata");
			return result;
		}),
};
