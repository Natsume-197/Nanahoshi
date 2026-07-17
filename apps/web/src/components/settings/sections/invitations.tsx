import {
	Check,
	CircleNotch,
	Copy,
	EnvelopeSimple,
	LinkSimple,
	Trash,
	X,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingRows } from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { formatDate } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

function invitationRoleLabel(role: "member" | "admin" | string | null) {
	if (role === "admin") return m["settings.invitations.admin"]();
	if (role === "member" || role == null)
		return m["settings.invitations.member"]();
	return role;
}

export function InvitationsSettings() {
	const qc = useQueryClient();
	const { data: org } = authClient.useActiveOrganization();
	const { data: session } = useSession();

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

	// Email invitations only work when the server has SMTP configured.
	const { data: providers } = useQuery(orpc.setup.ssoStatus.queryOptions());
	const mailerReady = providers?.mailer ?? true;

	return (
		<div className="flex flex-col gap-12">
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<p className="text-muted-foreground text-sm">
						{m["settings.invitations.desc"]()}
					</p>
					{canManage && mailerReady && (
						<InviteMemberDialog
							orgId={org?.id ?? ""}
							currentUserEmail={session?.user.email ?? ""}
							onSuccess={() => qc.invalidateQueries()}
						/>
					)}
				</div>

				{canManage && !mailerReady && (
					<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
						{m["settings.invitations.no_mailer"]()}
					</p>
				)}

				{!org && (
					<p className="text-muted-foreground text-sm">
						{m["settings.org.none_selected"]()}
					</p>
				)}
			</div>

			{/* ── Pending Invitations ───────────────────────────────────── */}
			{canManage && org && (
				<section className="flex flex-col gap-6">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["settings.invitations.pending"]()}
						</h2>
						<p className="text-muted-foreground text-sm">
							{m["settings.invitations.pending_desc"]()}
						</p>
					</div>

					{isInvitationsLoading && <InvitationRowsSkeleton />}

					{!isInvitationsLoading &&
						(!pendingInvitations ||
							(Array.isArray(pendingInvitations) &&
								pendingInvitations.length === 0)) && (
							<p className="text-muted-foreground text-sm">
								{m["settings.invitations.none_pending"]()}
							</p>
						)}

					{Array.isArray(pendingInvitations) &&
						pendingInvitations.length > 0 && (
							<SettingRows>
								{pendingInvitations.map((inv) => (
									<div
										key={inv.id}
										className="flex items-center justify-between gap-4 py-3"
									>
										<div>
											<p className="font-medium text-sm">{inv.email}</p>
											<p className="text-muted-foreground text-xs">
												{m["settings.invitations.role_expires"]({
													role: invitationRoleLabel(inv.role),
													date: formatDate(inv.expiresAt),
												})}
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
													toast.success(m["settings.invitations.cancelled"]());
													qc.invalidateQueries(
														orpc.invitations.listPending.queryOptions(),
													);
												} catch {
													toast.error(
														m["settings.invitations.cancel_failed"](),
													);
												}
											}}
											aria-label={m["settings.invitations.cancelled"]()}
										>
											<X className="size-4" />
										</Button>
									</div>
								))}
							</SettingRows>
						)}
				</section>
			)}

			{/* ── Invite Links ──────────────────────────────────────────── */}
			{canManage && org && (
				<section className="flex flex-col gap-6">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="font-semibold text-foreground text-xl">
								{m["settings.invitations.links"]()}
							</h2>
							<p className="text-muted-foreground text-sm">
								{m["settings.invitations.links_desc"]()}
							</p>
						</div>
						<CreateInviteLinkDialog
							onSuccess={() =>
								qc.invalidateQueries(orpc.inviteLinks.list.queryOptions())
							}
						/>
					</div>

					{isLinksLoading && <InvitationRowsSkeleton />}

					{!isLinksLoading && (!inviteLinks || inviteLinks.length === 0) && (
						<p className="text-muted-foreground text-sm">
							{m["settings.invitations.none_links"]()}
						</p>
					)}

					{inviteLinks && inviteLinks.length > 0 && (
						<SettingRows>
							{inviteLinks.map((link) => {
								const url = `${window.location.origin}/invite/${link.code}`;

								return (
									<div
										key={link.id}
										className="flex items-center justify-between gap-4 py-3"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<LinkSimple className="size-3.5 shrink-0 text-muted-foreground" />
												<p className="truncate font-mono text-muted-foreground text-xs">
													/invite/{link.code}
												</p>
											</div>
											<p className="mt-0.5 text-muted-foreground text-xs">
												{m["settings.invitations.role"]()}:{" "}
												<span>{invitationRoleLabel(link.role)}</span>
												{link.maxUses !== null &&
													` · ${m["settings.invitations.uses"]({
														used: link.useCount,
														max: link.maxUses,
													})}`}
												{link.expiresAt &&
													` · ${m["settings.invitations.expires"]({
														date: formatDate(link.expiresAt),
													})}`}
											</p>
										</div>

										<div className="ml-3 flex shrink-0 gap-2">
											<CopyButton text={url} />
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													try {
														await client.inviteLinks.delete({ id: link.id });
														toast.success(
															m["settings.invitations.link_deleted"](),
														);
														qc.invalidateQueries(
															orpc.inviteLinks.list.queryOptions(),
														);
													} catch {
														toast.error(
															m["settings.invitations.delete_failed"](),
														);
													}
												}}
												aria-label={m["settings.invitations.link_deleted"]()}
											>
												<Trash className="size-4" />
											</Button>
										</div>
									</div>
								);
							})}
						</SettingRows>
					)}
				</section>
			)}
		</div>
	);
}

function InvitationRowsSkeleton() {
	return (
		<SettingRows>
			{["a", "b"].map((key) => (
				<div key={key} className="flex items-center justify-between gap-4 py-3">
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-56" />
					</div>
					<Skeleton className="size-8 rounded-lg" />
				</div>
			))}
		</SettingRows>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="outline"
			size="sm"
			aria-label={m["settings.invitations.copy_link"]()}
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
				? m["settings.invitations.self_invite"]()
				: "",
		);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (email.trim().toLowerCase() === currentUserEmail.toLowerCase()) {
			setEmailError(m["settings.invitations.self_invite"]());
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
			toast.error(error.message ?? m["settings.invitations.send_failed"]());
			return;
		}
		toast.success(m["settings.invitations.sent_to"]({ email }));
		setEmail("");
		setEmailError("");
		setOpen(false);
		onSuccess();
	};

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<EnvelopeSimple className="mr-2 size-4" />
				{m["settings.invitations.invite_member"]()}
			</Button>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title={m["settings.invitations.invite_member"]()}
				description={m["settings.invitations.invite_member_desc"]()}
				className="sm:max-w-md"
				onSubmit={handleSubmit}
				footer={
					<>
						<Button variant="outline" onClick={() => setOpen(false)}>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={isPending || !!emailError}>
							{isPending && (
								<CircleNotch className="mr-2 size-4 animate-spin" />
							)}
							{m["settings.invitations.send"]()}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="invite-email">
							{m["settings.invitations.email_address"]()}
						</Label>
						<Input
							id="invite-email"
							type="email"
							placeholder={m["settings.invitations.email_placeholder"]()}
							value={email}
							onChange={(e) => handleEmailChange(e.target.value)}
							required
						/>
						{emailError && (
							<p className="text-destructive text-xs">{emailError}</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-role">
							{m["settings.invitations.role"]()}
						</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="member">
										{m["settings.invitations.member_option"]()}
									</SelectItem>
									<SelectItem value="admin">
										{m["settings.invitations.admin_option"]()}
									</SelectItem>
								</SelectGroup>
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
			toast.success(m["settings.invitations.created_link"]());
			setOpen(false);
			onSuccess();
		} catch {
			toast.error(m["settings.invitations.create_link_failed"]());
		} finally {
			setIsPending(false);
		}
	};

	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				<LinkSimple className="mr-2 size-4" />
				{m["settings.invitations.new_link"]()}
			</Button>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title={m["settings.invitations.create_link"]()}
				description={m["settings.invitations.create_link_desc"]()}
				className="sm:max-w-md"
				onSubmit={handleCreate}
				footer={
					<>
						<Button variant="outline" onClick={() => setOpen(false)}>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending && (
								<CircleNotch className="mr-2 size-4 animate-spin" />
							)}
							{m["settings.invitations.create_link_action"]()}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="link-role">
							{m["settings.invitations.role"]()}
						</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
						>
							<SelectTrigger id="link-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="member">
										{m["settings.invitations.member"]()}
									</SelectItem>
									<SelectItem value="admin">
										{m["settings.invitations.admin"]()}
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="link-max-uses">
							{m["settings.invitations.max_uses_label"]()}{" "}
							<span className="text-muted-foreground">
								{m["settings.invitations.unlimited_hint"]()}
							</span>
						</Label>
						<Input
							id="link-max-uses"
							type="number"
							min="1"
							placeholder={m["settings.invitations.unlimited"]()}
							value={maxUses}
							onChange={(e) => setMaxUses(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="link-expires">
							{m["settings.invitations.expires_label"]()}
						</Label>
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
								<SelectGroup>
									<SelectItem value="never">
										{m["settings.invitations.never"]()}
									</SelectItem>
									<SelectItem value="1d">
										{m["settings.invitations.one_day"]()}
									</SelectItem>
									<SelectItem value="7d">
										{m["settings.invitations.seven_days"]()}
									</SelectItem>
									<SelectItem value="30d">
										{m["settings.invitations.thirty_days"]()}
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				</div>
			</Modal>
		</>
	);
}
