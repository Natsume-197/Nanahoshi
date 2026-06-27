import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link, Loader2, MailPlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

export function InvitationsSettings() {
	const qc = useQueryClient();
	const { data: org } = authClient.useActiveOrganization();
	const { data: session } = authClient.useSession();

	const { can } = useAbilities();
	const canManage = can("member", "invite");

	const { data: pendingInvitations, isLoading: isInvitationsLoading } =
		useQuery({
			...orpc.invitations.listPending.queryOptions(),
			enabled: !!org,
		});

	const { data: inviteLinks, isLoading: isLinksLoading } = useQuery({
		...orpc.inviteLinks.list.queryOptions(),
		enabled: !!org,
	});

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Invite people to your server by email or with a shareable link.
				</p>
				{canManage && (
					<InviteMemberDialog
						orgId={org?.id ?? ""}
						currentUserEmail={session?.user.email ?? ""}
						onSuccess={() => qc.invalidateQueries()}
					/>
				)}
			</div>

			{!org && (
				<p className="text-muted-foreground text-sm">
					No active server selected.
				</p>
			)}

			{/* ── Pending Invitations ───────────────────────────────────── */}
			{canManage && org && (
				<div className="space-y-4">
					<div>
						<h3 className="font-semibold text-base">Pending Invitations</h3>
						<p className="text-muted-foreground text-sm">
							Email invitations awaiting acceptance
						</p>
					</div>

					{isInvitationsLoading && (
						<Skeleton className="h-12 w-full rounded-lg" />
					)}

					{!isInvitationsLoading &&
						(!pendingInvitations ||
							(Array.isArray(pendingInvitations) &&
								pendingInvitations.length === 0)) && (
							<p className="text-muted-foreground text-sm">
								No pending invitations.
							</p>
						)}

					{Array.isArray(pendingInvitations) &&
						pendingInvitations.map((inv) => (
							<div
								key={inv.id}
								className="flex items-center justify-between rounded-lg border border-border/50 p-4"
							>
								<div>
									<p className="font-medium text-sm">{inv.email}</p>
									<p className="text-muted-foreground text-xs capitalize">
										Role: {inv.role} · Expires{" "}
										{new Date(inv.expiresAt).toLocaleDateString()}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={async () => {
										try {
											await client.invitations.cancel({
												invitationId: inv.id,
											});
											toast.success("Invitation cancelled");
											qc.invalidateQueries(
												orpc.invitations.listPending.queryOptions(),
											);
										} catch {
											toast.error("Failed to cancel invitation");
										}
									}}
								>
									<X className="size-4" />
								</Button>
							</div>
						))}
				</div>
			)}

			{/* ── Invite Links ──────────────────────────────────────────── */}
			{canManage && org && (
				<>
					<Separator />
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="font-semibold text-base">Invite Links</h3>
								<p className="text-muted-foreground text-sm">
									Shareable links to join this server
								</p>
							</div>
							<CreateInviteLinkDialog
								onSuccess={() =>
									qc.invalidateQueries(orpc.inviteLinks.list.queryOptions())
								}
							/>
						</div>

						{isLinksLoading && <Skeleton className="h-12 w-full rounded-lg" />}

						{!isLinksLoading && (!inviteLinks || inviteLinks.length === 0) && (
							<p className="text-muted-foreground text-sm">
								No invite links yet.
							</p>
						)}

						{inviteLinks?.map((link) => {
							const url = `${window.location.origin}/invite/${link.code}`;
							const isRevoked = !!link.revokedAt;
							const isExpired =
								link.expiresAt && new Date(link.expiresAt) < new Date();
							const isMaxed =
								link.maxUses !== null && link.useCount >= link.maxUses;

							return (
								<div
									key={link.id}
									className="flex items-center justify-between rounded-lg border border-border/50 p-4"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Link className="size-3.5 shrink-0 text-muted-foreground" />
											<p className="truncate font-mono text-muted-foreground text-xs">
												/invite/{link.code}
											</p>
											{isRevoked ? (
												<Badge variant="destructive" className="text-[10px]">
													Revoked
												</Badge>
											) : isExpired ? (
												<Badge variant="secondary" className="text-[10px]">
													Expired
												</Badge>
											) : isMaxed ? (
												<Badge variant="secondary" className="text-[10px]">
													Max uses
												</Badge>
											) : (
												<Badge variant="outline" className="text-[10px]">
													Active
												</Badge>
											)}
										</div>
										<p className="mt-0.5 text-muted-foreground text-xs">
											Role: <span className="capitalize">{link.role}</span>
											{link.maxUses !== null &&
												` · ${link.useCount}/${link.maxUses} uses`}
											{link.expiresAt &&
												` · Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
										</p>
									</div>

									<div className="ml-3 flex shrink-0 gap-2">
										{!isRevoked && <CopyButton text={url} />}
										<Button
											variant="outline"
											size="sm"
											disabled={isRevoked}
											onClick={async () => {
												try {
													await client.inviteLinks.revoke({ id: link.id });
													toast.success("Invite link revoked");
													qc.invalidateQueries(
														orpc.inviteLinks.list.queryOptions(),
													);
												} catch {
													toast.error("Failed to revoke link");
												}
											}}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => {
				navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
		>
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
		</Button>
	);
}

function InviteMemberDialog({
	orgId,
	onSuccess,
	currentUserEmail,
}: {
	orgId: string;
	onSuccess: () => void;
	currentUserEmail: string;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [isPending, setIsPending] = useState(false);
	const [emailError, setEmailError] = useState("");

	const handleEmailChange = (v: string) => {
		setEmail(v);
		setEmailError(
			v.trim().toLowerCase() === currentUserEmail.toLowerCase()
				? "You can't invite yourself."
				: "",
		);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (email.trim().toLowerCase() === currentUserEmail.toLowerCase()) {
			setEmailError("You can't invite yourself.");
			return;
		}
		setIsPending(true);
		const { error } = await authClient.organization.inviteMember({
			email,
			role,
			organizationId: orgId,
		});
		setIsPending(false);
		if (error) {
			toast.error(error.message ?? "Failed to send invitation");
			return;
		}
		toast.success(`Invitation sent to ${email}`);
		setEmail("");
		setEmailError("");
		setOpen(false);
		onSuccess();
	};

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<MailPlus className="mr-2 size-4" />
				Invite Member
			</Button>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Invite Member"
				description="Send an email invitation to add a new member to your server."
				className="sm:max-w-md"
				onSubmit={handleSubmit}
				footer={
					<>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || !!emailError}>
							{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
							Send Invitation
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="invite-email">Email address</Label>
						<Input
							id="invite-email"
							type="email"
							placeholder="colleague@example.com"
							value={email}
							onChange={(e) => handleEmailChange(e.target.value)}
							required
						/>
						{emailError && (
							<p className="text-destructive text-xs">{emailError}</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-role">Role</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">
									Member — can read &amp; download
								</SelectItem>
								<SelectItem value="admin">
									Admin — can manage libraries
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</Modal>
		</>
	);
}

function CreateInviteLinkDialog({ onSuccess }: { onSuccess: () => void }) {
	const [open, setOpen] = useState(false);
	const [role, setRole] = useState<"member" | "admin">("member");
	const [maxUses, setMaxUses] = useState("");
	const [expiresIn, setExpiresIn] = useState<"1d" | "7d" | "30d" | "never">(
		"never",
	);
	const [isPending, setIsPending] = useState(false);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsPending(true);
		try {
			await client.inviteLinks.create({
				role,
				maxUses: maxUses ? Number(maxUses) : null,
				expiresIn,
			});
			toast.success("Invite link created");
			setOpen(false);
			onSuccess();
		} catch {
			toast.error("Failed to create invite link");
		} finally {
			setIsPending(false);
		}
	};

	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				<Link className="mr-2 size-4" />
				New Link
			</Button>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Create Invite Link"
				description="Anyone with this link can join your server with the selected role."
				className="sm:max-w-md"
				onSubmit={handleCreate}
				footer={
					<>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
							Create Link
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="link-role">Role</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
						>
							<SelectTrigger id="link-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="link-max-uses">
							Max uses{" "}
							<span className="text-muted-foreground">
								(leave empty for unlimited)
							</span>
						</Label>
						<Input
							id="link-max-uses"
							type="number"
							min="1"
							placeholder="Unlimited"
							value={maxUses}
							onChange={(e) => setMaxUses(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="link-expires">Expires</Label>
						<Select
							value={expiresIn}
							onValueChange={(v) =>
								setExpiresIn(v as "1d" | "7d" | "30d" | "never")
							}
						>
							<SelectTrigger id="link-expires">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="never">Never</SelectItem>
								<SelectItem value="1d">1 day</SelectItem>
								<SelectItem value="7d">7 days</SelectItem>
								<SelectItem value="30d">30 days</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</Modal>
		</>
	);
}
