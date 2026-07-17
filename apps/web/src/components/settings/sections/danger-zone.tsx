import { CircleNotch } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAbilities } from "@/hooks/use-abilities";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { switchActiveServer } from "@/lib/switch-server";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

/** Owner-only irreversible actions: transfer ownership and delete the server. */
export function DangerZone() {
	const { isOrgOwner } = useAbilities();
	const { data: session } = useSession();
	const { data: org } = authClient.useActiveOrganization();
	const { data: orgs } = authClient.useListOrganizations();
	const qc = useQueryClient();

	const [transferOpen, setTransferOpen] = useState(false);
	const [targetUserId, setTargetUserId] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [nameConfirm, setNameConfirm] = useState("");

	const transferMutation = useMutation(
		orpc.members.transferOwnership.mutationOptions({
			onSuccess: () => {
				toast.success(m["settings.members.ownership_transferred"]());
				setTransferOpen(false);
				qc.invalidateQueries();
			},
			onError: (error) => toast.error(getErrorMessage(error)),
		}),
	);

	const deleteMutation = useMutation({
		mutationFn: () => client.serverProfile.deleteServer(),
		onSuccess: async () => {
			toast.success(m["settings.org.deleted"]());
			const next = orgs?.find((o) => o.id !== org?.id);
			await switchActiveServer(next?.id ?? null);
			// Hard redirect: closes the settings modal and reboots every query
			// under the new active server in one step.
			window.location.assign("/dashboard");
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["settings.org.delete_failed"]())),
	});

	if (!isOrgOwner || !org) return null;

	const candidates = (org.members ?? []).filter(
		(member) => member.userId !== session?.user.id,
	);
	const deleteConfirmed = nameConfirm.trim() === org.name;

	return (
		<>
			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.org.danger_zone"]()}
				</h2>
				<SettingRows>
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["settings.org.transfer_label"]()}
							</h3>
						}
						description={m["settings.org.transfer_desc"]()}
					>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0 self-start sm:self-auto"
							onClick={() => {
								setTargetUserId("");
								setTransferOpen(true);
							}}
						>
							{m["settings.org.transfer_action"]()}
						</Button>
					</SettingControlRow>

					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["settings.org.delete_label"]()}
							</h3>
						}
						description={m["settings.org.delete_desc"]()}
					>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							className="shrink-0 self-start sm:self-auto"
							onClick={() => {
								setNameConfirm("");
								setDeleteOpen(true);
							}}
						>
							{m["common.delete"]()}
						</Button>
					</SettingControlRow>
				</SettingRows>
			</section>

			<Modal
				open={transferOpen}
				onOpenChange={(open) => {
					if (!open) setTransferOpen(false);
				}}
				title={m["settings.org.transfer_label"]()}
				description={m["settings.org.transfer_modal_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setTransferOpen(false)}
							disabled={transferMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!targetUserId || transferMutation.isPending}
							onClick={() => transferMutation.mutate({ targetUserId })}
						>
							{transferMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["settings.org.transfer_action"]()}
						</Button>
					</>
				}
			>
				<Select
					value={targetUserId}
					onValueChange={setTargetUserId}
					items={candidates.map((member) => ({
						value: member.userId,
						label: member.user?.name || member.user?.email || member.userId,
					}))}
				>
					<SelectTrigger>
						<SelectValue
							placeholder={m["settings.org.transfer_select_placeholder"]()}
						/>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{candidates.map((member) => (
								<SelectItem key={member.userId} value={member.userId}>
									{member.user?.name || member.user?.email || member.userId}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Modal>

			<Modal
				open={deleteOpen}
				onOpenChange={(open) => {
					if (!open) setDeleteOpen(false);
				}}
				title={m["settings.org.delete_label"]()}
				description={m["settings.org.delete_modal_desc"]({ name: org.name })}
				onSubmit={(event) => {
					event.preventDefault();
					if (deleteConfirmed && !deleteMutation.isPending)
						deleteMutation.mutate();
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDeleteOpen(false)}
							disabled={deleteMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={!deleteConfirmed || deleteMutation.isPending}
						>
							{deleteMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.delete"]()}
						</Button>
					</>
				}
			>
				<Input
					autoFocus
					value={nameConfirm}
					onChange={(event) => setNameConfirm(event.target.value)}
					placeholder={org.name}
					disabled={deleteMutation.isPending}
				/>
			</Modal>
		</>
	);
}
