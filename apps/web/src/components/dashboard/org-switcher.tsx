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
	variant = "header",
	initialOrganizations,
	activeOrganizationId,
}: {
	/**
	 * "header" is badge + name in the top bar; "sidebar" is the panel's text
	 * header. Both open the same switcher, mirroring Slack's workspace avatar
	 * and workspace-name header.
	 */
	variant?: "header" | "sidebar";
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
		return variant === "sidebar" ? (
			<Skeleton className="h-8 w-40 rounded-lg" />
		) : (
			<Skeleton className="h-9 w-52 rounded-lg" />
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

	const trigger =
		variant === "sidebar" ? (
			// Text only: the badge already leads the top bar, so repeating it here
			// would put two server marks in the same eyeline.
			<Button
				type="button"
				variant="ghost"
				className="h-8 w-full justify-start gap-1 rounded-md px-2 font-bold text-base hover:bg-sidebar-accent/60"
			>
				<span className="min-w-0 flex-1 truncate text-left text-foreground">
					{activeName}
				</span>
				<CaretDown weight="bold" className="size-3.5 shrink-0" />
			</Button>
		) : (
			<Button
				variant="ghost"
				className="h-9 w-fit max-w-64 gap-2 rounded-lg pr-2 pl-1.5"
			>
				<ServerBadge name={activeName} logo={activeOrg?.logo} />
				<span className="min-w-0 flex-1 truncate text-left font-medium">
					{activeName}
				</span>
				<CaretDown className="size-4 shrink-0 text-muted-foreground" />
			</Button>
		);

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={variant === "sidebar" ? 8 : 6}
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
