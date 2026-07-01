import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, LogOut, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import {
	isServerScopedDetailPath,
	switchActiveServer,
} from "@/lib/switch-server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

function orgInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function OrgBadge({ name, className }: { name: string; className?: string }) {
	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[10px] text-muted-foreground",
				className,
			)}
		>
			{orgInitials(name)}
		</span>
	);
}

export function OrgSwitcher() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: orgs, isPending } = authClient.useListOrganizations();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { can, isOrgOwner } = useAbilities();
	const { openOrgSettings } = useSettingsModal();
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);

	// Show the org-settings entry only to those who can manage something in it.
	const canManageOrg =
		isOrgOwner ||
		can("settings", "update") ||
		can("library", "create") ||
		can("library", "manageAccess") ||
		can("member", "list") ||
		can("member", "invite") ||
		can("roles", "manage");

	if (isPending) {
		return <Skeleton className="h-9 w-40 rounded-full" />;
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

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					className="h-9 max-w-52 gap-2 rounded-full pr-3 pl-1"
				>
					<OrgBadge name={activeName} />
					<span className="truncate">{activeName}</span>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="min-w-56 bg-card"
			>
				<DropdownMenuLabel className="text-muted-foreground text-xs">
					{m["server.list_label"]()}
				</DropdownMenuLabel>
				{orgs.map((org) => {
					const isActive = org.id === activeOrg?.id;
					return (
						<DropdownMenuItem
							key={org.id}
							onClick={() => handleSwitchOrg(org.id)}
							className="gap-2.5"
						>
							<OrgBadge name={org.name} className="size-6 text-[9px]" />
							<span className="flex-1 truncate">{org.name}</span>
							{isActive && <Check className="size-4 shrink-0 text-primary" />}
						</DropdownMenuItem>
					);
				})}
				{activeOrg && (canManageOrg || !isOrgOwner) && (
					<DropdownMenuSeparator />
				)}
				{activeOrg && canManageOrg && (
					<DropdownMenuItem
						onClick={() => openOrgSettings("general")}
						className="gap-2.5"
					>
						<Settings2 className="size-4 shrink-0 text-muted-foreground" />
						<span className="flex-1">{m["server.settings"]()}</span>
					</DropdownMenuItem>
				)}
				{/* The owner can't leave their own org — they must transfer it first. */}
				{activeOrg && !isOrgOwner && (
					<DropdownMenuItem
						variant="destructive"
						onSelect={(e) => {
							e.preventDefault();
							setLeaveOpen(true);
						}}
						className="gap-2.5"
					>
						<LogOut className="size-4 shrink-0" />
						<span className="flex-1">{m["server.leave"]()}</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<>
			{dropdown}
			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{m["server.leave_title"]({ name: activeName })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{m["server.leave_desc"]()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isLeaving}>
							{m["common.cancel"]()}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleLeave();
							}}
							disabled={isLeaving}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{m["server.leave_action"]()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
