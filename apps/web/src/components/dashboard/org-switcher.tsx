import {
	Check,
	DotsThreeVertical,
	Plus,
	SignOut,
	Sliders,
	UserPlus,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { CreateServerDialog } from "@/components/servers/create-server-dialog";
import { ServerBadge } from "@/components/shared/server-badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardOrganization } from "@/functions/get-organizations";
import { useAbilities } from "@/hooks/use-abilities";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import {
	isServerScopedDetailPath,
	switchActiveServer,
} from "@/lib/switch-server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export function OrgSwitcher({
	initialOrganizations,
	activeOrganizationId,
}: {
	initialOrganizations?: DashboardOrganization[];
	activeOrganizationId: string | null;
}) {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		data: clientOrganizations,
		isPending,
		refetch: refetchOrganizations,
	} = authClient.useListOrganizations();
	const orgs = clientOrganizations ?? initialOrganizations;
	const activeOrg = orgs?.find((org) => org.id === activeOrganizationId);
	const { can, isOrgOwner } = useAbilities();
	const { data: session } = useSession();
	const { openOrgSettings } = useSettingsModal();
	const [createOpen, setCreateOpen] = useState(false);
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const canCreateServer = session?.user.role === "admin";

	// Same gate as the invitations section inside the server-settings modal.
	const canInvite = can("member", "invite");

	// Show the org-settings entry only to those who can manage something in it.
	const canManageOrg =
		isOrgOwner ||
		can("settings", "update") ||
		can("library", "create") ||
		can("library", "update") ||
		can("library", "delete") ||
		can("library", "scan") ||
		can("library", "managePaths") ||
		can("library", "manageProviders") ||
		can("library", "manageAccess") ||
		can("library", "upload") ||
		can("member", "list") ||
		can("member", "invite") ||
		can("roles", "manage");

	if (isPending && initialOrganizations === undefined) {
		return (
			// The trigger's geometry, so nothing shifts when the org list resolves.
			<div className="flex h-12 items-center gap-3 md:ms-2 md:ps-3">
				<Skeleton className="size-9 rounded-lg" />
				<Skeleton className="h-4 w-24 rounded-lg md:w-32" />
			</div>
		);
	}

	if (!orgs || orgs.length === 0) {
		return null;
	}

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrg?.id) return;
		// Stay on list/index pages (they refetch under the new server); only leave
		// a catalog detail page, whose entity belongs to the previous server.
		const leave = isServerScopedDetailPath(location.pathname);
		try {
			await switchActiveServer(
				orgId,
				leave ? () => navigate({ to: "/dashboard" }) : undefined,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.switch_server_failed"](),
			);
		}
	};

	const handleLeave = async () => {
		if (!activeOrg) return;
		setIsLeaving(true);
		try {
			const { error } = await authClient.organization.leave({
				organizationId: activeOrg.id,
			});
			if (error) {
				toast.error(error.message ?? m["toast.leave_server_failed"]());
				return;
			}
			toast.success(m["server.left"]({ name: activeOrg.name }));
			// Move to a remaining org (or clear the active org if none are left) so the
			// dashboard doesn't keep querying the org we just left.
			const next = orgs?.find((o) => o.id !== activeOrg.id);
			await switchActiveServer(next?.id ?? null, () =>
				navigate({ to: "/dashboard" }),
			);
		} finally {
			setIsLeaving(false);
			setLeaveOpen(false);
		}
	};

	const activeName = activeOrg?.name ?? m["server.select"]();
	const hasActions =
		canCreateServer ||
		Boolean(activeOrg && (canInvite || canManageOrg || !isOrgOwner));

	const trigger = (
		<Button
			variant="ghost"
			// From md it's a card sitting on the rail's 8px gutter; expanded it spans
			// the rail rows below it, so the dots line up with their trailing edge.
			// No fill at rest, so it never reads as a second active row.
			className="group h-12 w-full min-w-0 max-w-full justify-start gap-3 rounded-lg border-0 px-0 py-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset aria-expanded:bg-transparent md:ms-2 md:w-fit rail-expanded:md:w-[calc(var(--rail-width)-1.375rem)] md:max-w-72 md:ps-3 md:pe-3 md:aria-expanded:bg-sidebar-accent/70 md:hover:bg-sidebar-accent/70 dark:hover:bg-transparent dark:md:hover:bg-sidebar-accent/70"
		>
			<ServerBadge
				name={activeName}
				logo={activeOrg?.logo}
				className="size-9 shrink-0 text-xs"
			/>
			<span className="min-w-0 flex-1 text-start">
				<span className="block truncate font-semibold text-sm leading-tight md:text-[15px]">
					{activeName}
				</span>
				<span className="block truncate font-normal text-nav-inactive text-xs leading-tight">
					Nanahoshi
				</span>
			</span>
			<DotsThreeVertical
				weight="bold"
				className="size-4 shrink-0 text-nav-inactive group-hover:text-sidebar-foreground"
			/>
		</Button>
	);

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6} className="min-w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						{m["server.list_label"]()}
					</DropdownMenuLabel>
					{orgs.map((org) => {
						const isActive = org.id === activeOrg?.id;
						return (
							<DropdownMenuItem
								key={org.id}
								onClick={() => handleSwitchOrg(org.id)}
								className={cn(
									"min-h-10 gap-2.5 py-2",
									isActive && "bg-accent/60",
								)}
							>
								<ServerBadge
									name={org.name}
									logo={org.logo}
									className="size-6 text-[9px]"
								/>
								<span
									className={cn("flex-1 truncate", isActive && "font-medium")}
								>
									{org.name}
								</span>
								{isActive && <Check className="text-primary" />}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>
				{hasActions && <DropdownMenuSeparator />}
				{hasActions && (
					<DropdownMenuGroup>
						{canCreateServer && (
							<DropdownMenuItem
								onClick={() => setCreateOpen(true)}
								className="gap-2.5"
							>
								<Plus />
								<span className="flex-1">{m["server.create"]()}</span>
							</DropdownMenuItem>
						)}
						{activeOrg && canInvite && (
							<DropdownMenuItem
								onClick={() => openOrgSettings("invitations")}
								className="gap-2.5"
							>
								<UserPlus className="text-muted-foreground" />
								<span className="flex-1">{m["server.invite"]()}</span>
							</DropdownMenuItem>
						)}
						{activeOrg && canManageOrg && (
							<DropdownMenuItem
								onClick={() => openOrgSettings("general")}
								className="gap-2.5"
							>
								<Sliders className="text-muted-foreground" />
								<span className="flex-1">{m["server.settings"]()}</span>
							</DropdownMenuItem>
						)}
						{/* The owner can't leave their own org — they must transfer it first. */}
						{activeOrg && !isOrgOwner && (
							<DropdownMenuItem
								variant="destructive"
								onClick={() => setLeaveOpen(true)}
								className="gap-2.5"
							>
								<SignOut />
								<span className="flex-1">{m["server.leave"]()}</span>
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<>
			{dropdown}
			{canCreateServer && (
				<CreateServerDialog
					open={createOpen}
					onOpenChange={setCreateOpen}
					onCreated={() => refetchOrganizations()}
				/>
			)}
			<Modal
				open={leaveOpen}
				onOpenChange={setLeaveOpen}
				title={m["server.leave_title"]({ name: activeName })}
				description={m["server.leave_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={isLeaving}
							onClick={() => setLeaveOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={isLeaving}
							onClick={handleLeave}
						>
							{m["server.leave_action"]()}
						</Button>
					</>
				}
			/>
		</>
	);
}
