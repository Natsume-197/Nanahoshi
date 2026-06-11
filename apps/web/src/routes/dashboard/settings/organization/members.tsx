import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Link, Loader2, MailPlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { membersColumns } from "@/components/data-table/columns/members-columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute(
	"/dashboard/settings/organization/members",
)({
	component: MembersSettings,
});

export function MembersSettings() {
	const qc = useQueryClient();
	const { data: org, isPending: isLoading } =
		authClient.useActiveOrganization();
	const { data: session } = authClient.useSession();
	const hasOrg = !!org;

	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: hasOrg,
	});

	// ── Pending invitations ─────────────────────────────────────────────────
	const { data: pendingInvitations, isLoading: isInvitationsLoading } =
		useQuery({
			...orpc.invitations.listPending.queryOptions(),
			enabled: !!org,
		});

	// ── Invite links ────────────────────────────────────────────────────────
	const { data: inviteLinks, isLoading: isLinksLoading } = useQuery({
		...orpc.inviteLinks.list.queryOptions(),
		enabled: !!org,
	});

	const orgMemberRole =
		myRoleData?.role ??
		org?.members.find((m) => m.userId === session?.user?.id)?.role;
	const canManage =
		session?.user && orgMemberRole && orgMemberRole !== "member";

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-2xl tracking-tight">Members</h2>
					<p className="text-muted-foreground text-sm">
						Manage members of your organization
					</p>
				</div>
				{canManage && (
					<InviteMemberDialog
						orgId={org?.id ?? ""}
						currentUserEmail={session?.user.email ?? ""}
						onSuccess={() => qc.invalidateQueries()}
					/>
				)}
			</div>

			{/* ── Members list ─────────────────────────────────────────── */}
			{!isLoading && !org && (
				<p className="text-muted-foreground text-sm">
					No active organization selected.
				</p>
			)}

			<DataTable
				columns={membersColumns}
				data={org?.members ?? []}
				isLoading={isLoading}
				emptyState={{ description: "No members in this organization." }}
				meta={{
					canManage: !!canManage,
					onMemberRemoved: () => qc.invalidateQueries(),
				}}
			/>

			{/* ── Pending Invitations ───────────────────────────────────── */}
			{canManage && org && (
				<>
					<Separator />
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
				</>
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
									Shareable links to join this organization
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
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<MailPlus className="mr-2 size-4" />
					Invite Member
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Invite Member</DialogTitle>
					<DialogDescription>
						Send an email invitation to add a new member to your organization.
					</DialogDescription>
				</DialogHeader>
				<form
					id="invite-form"
					onSubmit={handleSubmit}
					className="space-y-4 py-2"
				>
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
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="invite-form"
						disabled={isPending || !!emailError}
					>
						{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
						Send Invitation
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
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
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Link className="mr-2 size-4" />
					New Link
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create Invite Link</DialogTitle>
					<DialogDescription>
						Anyone with this link can join your organization with the selected
						role.
					</DialogDescription>
				</DialogHeader>
				<form id="link-form" onSubmit={handleCreate} className="space-y-4 py-2">
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
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button type="submit" form="link-form" disabled={isPending}>
						{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
						Create Link
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
