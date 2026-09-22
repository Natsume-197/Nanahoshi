import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	AudiobookMatchDialog,
	BookMatchDialog,
} from "@/components/metadata/match-metadata-dialog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { client, orpc } from "@/utils/orpc";
import { ApprovalReasonBreakdown } from "./approval-reason-breakdown";
import { ALL_LIBRARIES } from "./filters";
import { MatchReasonChip } from "./lifecycle";
import { ProviderFixDialog } from "./match-controls";
import type { MatchDecisionCandidate, MatchRow, RowActions } from "./types";

type FixTarget = {
	bookUuid: string;
	title: string;
	mediaType: "ebook" | "audiobook";
};

type TargetInput = Parameters<typeof client.enrichment.approvalPreview>[0];
export function useMatchActions({
	clearSelection,
	closeDetail,
	libraryUuid,
	providerLabels,
	cooldowns,
	failureBanners,
	failingBooks,
}: {
	clearSelection: () => void;
	closeDetail: () => void;
	libraryUuid: string;
	providerLabels: Record<string, string>;
	cooldowns: [string, number][];
	failureBanners: [string, number][];
	failingBooks: number;
}) {
	const queryClient = useQueryClient();
	const singleLibrary = libraryUuid !== ALL_LIBRARIES;
	const [fixTarget, setFixTarget] = useState<FixTarget | null>(null);
	const [providerFixOpen, setProviderFixOpen] = useState(false);
	const [restoreRequest, setRestoreRequest] = useState<{
		count: number;
		input: TargetInput;
	} | null>(null);
	const [approvalPreview, setApprovalPreview] = useState<{
		data: Awaited<ReturnType<typeof client.enrichment.approvalPreview>>;
		input: TargetInput;
	} | null>(null);
	const invalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: orpc.enrichment.list.key() });
		queryClient.invalidateQueries({
			queryKey: orpc.enrichment.actionableCounts.key(),
		});
	};

	const mutationSettled = (message: string) => ({
		onSuccess: () => {
			toast.success(message);
			clearSelection();
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});

	const retryMutation = useMutation(orpc.enrichment.retry.mutationOptions());
	const approveMutation = useMutation(
		orpc.enrichment.approve.mutationOptions(),
	);
	const approvalPreviewMutation = useMutation({
		mutationFn: (
			input: Parameters<typeof client.enrichment.approvalPreview>[0],
		) => client.enrichment.approvalPreview(input),
		onSuccess: (data, input) => setApprovalPreview({ data, input }),
		onError: (error: Error) => toast.error(error.message),
	});
	const cancelRetryMutation = useMutation(
		orpc.enrichment.cancelRetry.mutationOptions(),
	);
	const restoreMutation = useMutation(
		orpc.enrichment.restoreOriginal.mutationOptions(),
	);
	const pauseSettled = {
		onSuccess: (result: { paused: boolean }) => {
			toast.success(
				result.paused
					? m["enrichment.paused_toast"]()
					: m["enrichment.resumed_toast"](),
			);
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibrariesOverview.key(),
			});
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	};
	const pauseMutation = useMutation(
		orpc.libraries.setAutoEnrichPaused.mutationOptions(pauseSettled),
	);
	const pauseAllMutation = useMutation(
		orpc.libraries.setAllAutoEnrichPaused.mutationOptions(pauseSettled),
	);
	const resolveProviderMutation = useMutation(
		orpc.enrichment.resolveProviderFailures.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					m["enrichment.provider_resolved_toast"]({
						count: result.reprocessed,
					}),
				);
				setProviderFixOpen(false);
				queryClient.invalidateQueries({
					queryKey: orpc.enrichment.providerStatus.key(),
				});
				invalidateAll();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const selectCandidateMutation = useMutation({
		mutationFn: async ({
			item,
			candidate,
		}: {
			item: MatchRow;
			candidate: MatchDecisionCandidate;
		}) => {
			if (item.mediaType === "audiobook") {
				const result = await client.audiobooks.applyMetadata({
					uuid: item.bookUuid,
					provider: candidate.provider as "audible" | "itunes",
					providerId: candidate.providerId,
				});
				if (result == null) throw new Error(m["match.apply_failed"]());
				return;
			}
			const result = await client.books.applyMetadata({
				uuid: item.bookUuid,
				provider: candidate.provider as Parameters<
					typeof client.books.applyMetadata
				>[0]["provider"],
				providerId: candidate.providerId,
			});
			if (!result.success) throw new Error(m["match.apply_failed"]());
		},
		onSuccess: () => {
			toast.success(m["match.applied"]());
			closeDetail();
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});

	const retrySettled = (count: number) => ({
		onSuccess: () => {
			if (cooldowns.length > 0) {
				const providers = cooldowns
					.map(([provider]) => providerLabels[provider] ?? provider)
					.join(", ");
				toast.info(
					m["enrichment.retry_deferred"]({
						count,
						providers,
					}),
				);
			} else {
				toast.success(m["enrichment.retry_enqueued"]({ count }));
			}
			clearSelection();
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});
	const busy =
		retryMutation.isPending ||
		approveMutation.isPending ||
		cancelRetryMutation.isPending ||
		restoreMutation.isPending ||
		selectCandidateMutation.isPending;

	// ── Single-book actions ──────────────────────────────────────────────────
	const retryOne = (uuid: string, refresh = false) =>
		retryMutation.mutate({ bookUuids: [uuid], refresh }, retrySettled(1));
	const cancelRetryOne = (uuid: string) =>
		cancelRetryMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.retry_cancelled"]({ count: 1 })),
		);
	const approveOne = (uuid: string) =>
		approveMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.approve_enqueued"]({ count: 1 })),
		);
	const openFix = (item: MatchRow) =>
		setFixTarget({
			bookUuid: item.bookUuid,
			title: item.title ?? "",
			mediaType: item.mediaType,
		});

	const rowActions = (item: MatchRow): RowActions => ({
		onRetry: () => retryOne(item.bookUuid),
		onRefresh: () => retryOne(item.bookUuid, true),
		onCancelRetry: () => cancelRetryOne(item.bookUuid),
		onApprove: () => approveOne(item.bookUuid),
		onFix: () => openFix(item),
		onSelectCandidate: (candidate) =>
			selectCandidateMutation.mutate({ item, candidate }),
	});

	const togglePause = (paused: boolean) => {
		if (singleLibrary) pauseMutation.mutate({ libraryUuid, paused });
		else pauseAllMutation.mutate({ paused });
	};
	const pausePending = pauseMutation.isPending || pauseAllMutation.isPending;

	const dialogs = (
		<>
			<Modal
				open={approvalPreview != null}
				onOpenChange={(open) => !open && setApprovalPreview(null)}
				title={m["enrichment.approval_preview_title"]()}
				description={m["enrichment.approval_preview_body"]({
					count: approvalPreview?.data.total ?? 0,
				})}
			>
				{approvalPreview && (
					<div className="space-y-4">
						<section className="space-y-1">
							<h3 className="font-medium text-sm">
								{m["enrichment.approval_preview_sources"]()}
							</h3>
							{Object.entries(approvalPreview.data.byProvider).map(
								([provider, count]) => (
									<p key={provider} className="text-muted-foreground text-sm">
										{providerLabels[provider] ?? provider}: {count}
									</p>
								),
							)}
						</section>
						<ApprovalReasonBreakdown byReason={approvalPreview.data.byReason} />
						<section className="space-y-1">
							<h3 className="font-medium text-sm">
								{m["enrichment.approval_preview_examples"]()}
							</h3>
							{approvalPreview.data.samples.map((sample) => (
								<div key={sample.bookUuid} className="space-y-1 py-1">
									<p className="truncate text-sm">
										{sample.title ?? sample.bookUuid}
										<span className="text-muted-foreground">
											{" · "}
											{providerLabels[sample.provider] ?? sample.provider}
										</span>
									</p>
									{sample.reasons.length > 0 && (
										<MatchReasonChip reasons={sample.reasons} />
									)}
								</div>
							))}
						</section>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setApprovalPreview(null)}
							>
								{m["enrichment.action_cancel"]()}
							</Button>
							<Button
								disabled={approveMutation.isPending}
								onClick={() => {
									setApprovalPreview(null);
									approveMutation.mutate(
										approvalPreview.input,
										mutationSettled(
											m["enrichment.approve_enqueued"]({
												count: approvalPreview.data.total,
											}),
										),
									);
								}}
							>
								{m["enrichment.approve"]()}
							</Button>
						</div>
					</div>
				)}
			</Modal>

			<Modal
				open={restoreRequest != null}
				onOpenChange={(open) => !open && setRestoreRequest(null)}
				title={m["enrichment.restore_original_title"]({
					count: restoreRequest?.count ?? 0,
				})}
				description={m["enrichment.restore_original_body"]()}
			>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setRestoreRequest(null)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button
						variant="destructive"
						disabled={restoreMutation.isPending}
						onClick={() => {
							if (!restoreRequest) return;
							restoreMutation.mutate(restoreRequest.input, {
								onSuccess: () => {
									setRestoreRequest(null);
									clearSelection();
									invalidateAll();
									toast.success(m["enrichment.restore_original_done"]());
								},
								onError: (error) => toast.error(error.message),
							});
						}}
					>
						{m["enrichment.restore_original"]()}
					</Button>
				</div>
			</Modal>

			{providerFixOpen && (
				<ProviderFixDialog
					open={providerFixOpen}
					onOpenChange={setProviderFixOpen}
					failures={failureBanners}
					providerLabels={providerLabels}
					reprocessCount={failingBooks}
					pending={resolveProviderMutation.isPending}
					onConfirm={(providers) =>
						resolveProviderMutation.mutate({ libraryUuid, providers })
					}
				/>
			)}

			{fixTarget?.mediaType === "ebook" && (
				<BookMatchDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							setFixTarget(null);
							invalidateAll();
						}
					}}
					bookUuid={fixTarget.bookUuid}
					initialTitle={fixTarget.title}
				/>
			)}
			{fixTarget?.mediaType === "audiobook" && (
				<AudiobookMatchDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							setFixTarget(null);
							invalidateAll();
						}
					}}
					audiobookUuid={fixTarget.bookUuid}
					initialTitle={fixTarget.title}
				/>
			)}
		</>
	);
	return {
		busy: busy || approvalPreviewMutation.isPending,
		pausePending,
		togglePause,
		rowActions,
		dialogs,
		setProviderFixOpen,
		anyDialogOpen:
			fixTarget != null ||
			providerFixOpen ||
			restoreRequest != null ||
			approvalPreview != null,
		retry: (input: TargetInput, count: number, refresh: boolean) =>
			retryMutation.mutate({ ...input, refresh }, retrySettled(count)),
		previewApproval: (input: TargetInput) =>
			approvalPreviewMutation.mutate(input),
		requestRestore: (input: TargetInput, count: number) =>
			setRestoreRequest({ input, count }),
	};
}
