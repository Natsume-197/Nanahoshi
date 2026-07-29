import {
	CaretDown,
	Check,
	SignOut,
	Sliders,
	UserPlus,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
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
	const { data: clientOrganizations, isPending } =
		authClient.useListOrganizations();
	const orgs = clientOrganizations ?? initialOrganizations;
	const activeOrg = orgs?.find((org) => org.id === activeOrganizationId);
	const { can, isOrgOwner } = useAbilities();
	const { openOrgSettings } = useSettingsModal();
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);

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
			<div className="flex h-12 items-center gap-3 pl-[calc((5.5rem-2.25rem)/2)]">
				<Skeleton className="size-9 rounded-lg" />
				<Skeleton className="h-4 w-32 rounded-lg" />
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
		await switchActiveServer(
			orgId,
			leave ? () => navigate({ to: "/dashboard" }) : undefined,
		);
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
	const hasActions = activeOrg && (canInvite || canManageOrg || !isOrgOwner);

	const trigger = (
		<Button
			variant="ghost"
			// This is the rail column's first block, so it follows the rail's rules:
			// highlight on the chip, never on the label, and the badge centred the
			// way the rail centres a 2.25rem chip in its 5.5rem column (border-0 —
			// a 1px border would push it off that axis).
			className="group h-12 w-fit max-w-72 gap-3 rounded-lg border-0 py-0 pr-3 pl-[calc((5.5rem-2.25rem)/2)] hover:bg-transparent focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-inset aria-expanded:bg-transparent dark:hover:bg-transparent"
		>
			{/* Ring, not padding: the halo grows outside the tile without moving it. */}
			<span className="grid rounded-lg ring-sidebar-accent/60 transition-[box-shadow] duration-150 ease-out-quart group-hover:ring-4 group-aria-expanded:ring-4">
				<ServerBadge
					name={activeName}
					logo={activeOrg?.logo}
					className="size-9 text-xs"
				/>
			</span>
			<span className="min-w-0 flex-1 truncate text-left font-semibold text-base">
				{activeName}
			</span>
			<CaretDown
				weight="bold"
				className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-150 ease-out-quart group-hover:text-foreground group-aria-expanded:text-foreground"
			/>
		</Button>
	);

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				// The trigger starts flush with the window edge, so the menu takes the
				// rail's own 8px gutter instead of hugging it.
				alignOffset={8}
				className="min-w-60 rounded-xl border border-border/60 shadow-black/20 shadow-xl ring-0"
			>
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
						{canInvite && (
							<DropdownMenuItem
								onClick={() => openOrgSettings("invitations")}
								className="gap-2.5"
							>
								<UserPlus className="text-muted-foreground" />
								<span className="flex-1">{m["server.invite"]()}</span>
							</DropdownMenuItem>
						)}
						{canManageOrg && (
							<DropdownMenuItem
								onClick={() => openOrgSettings("general")}
								className="gap-2.5"
							>
								<Sliders className="text-muted-foreground" />
								<span className="flex-1">{m["server.settings"]()}</span>
							</DropdownMenuItem>
						)}
						{/* The owner can't leave their own org — they must transfer it first. */}
						{!isOrgOwner && (
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
