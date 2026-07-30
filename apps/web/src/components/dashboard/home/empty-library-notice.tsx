import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { Books, CircleNotch } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { LibraryTaskProgress } from "@/components/libraries/library-task-progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { pickActiveImport } from "./import-task";

function useActiveImport(enabled: boolean): Task | null {
	const { data } = useQuery({
		...orpc.tasks.getActiveTasks.queryOptions(),
		enabled,
	});
	return pickActiveImport(data);
}

/** Shared dashed card shell for every empty/onboarding home state. */
function NoticeShell({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<div className="flex min-h-80 flex-col items-center justify-center gap-6 rounded-2xl border border-border/70 border-dashed bg-card/30 px-6 py-12 text-center">
			{children}
		</div>
	);
}

/** Live import progress — the reassuring bridge between "connect a folder" and
 * the first books showing up on the dashboard. */
function ImportingNotice({ task }: { task: Task }): JSX.Element {
	return (
		<NoticeShell>
			<div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground shadow-card">
				<CircleNotch
					aria-hidden="true"
					className="size-7 animate-spin motion-reduce:animate-none"
				/>
			</div>
			<div className="flex max-w-md flex-col gap-1.5">
				<h2 className="text-balance font-semibold text-xl leading-tight">
					{m["home.importing_title"]()}
				</h2>
				<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
					{m["home.importing_desc"]()}
				</p>
			</div>
			<LibraryTaskProgress task={task} />
		</NoticeShell>
	);
}

const STEPS = [
	{
		title: () => m["home.getting_started_step1_title"](),
		desc: () => m["home.getting_started_step1_desc"](),
	},
	{
		title: () => m["home.getting_started_step2_title"](),
		desc: () => m["home.getting_started_step2_desc"](),
	},
	{
		title: () => m["home.getting_started_step3_title"](),
		desc: () => m["home.getting_started_step3_desc"](),
	},
] as const;

/** New-admin onboarding: what happens, in order, with one clear next action
 * that deep-links straight into the create-library wizard. */
function GettingStartedNotice(): JSX.Element {
	const { openOrgSettings } = useSettingsModal();

	return (
		<NoticeShell>
			<div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground shadow-card">
				<Books aria-hidden="true" className="size-7" />
			</div>
			<div className="flex max-w-md flex-col gap-1.5">
				<h2 className="text-balance font-semibold text-xl leading-tight">
					{m["home.getting_started_title"]()}
				</h2>
				<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
					{m["home.getting_started_lead"]()}
				</p>
			</div>
			<ol className="flex w-full max-w-sm flex-col gap-4 text-left">
				{STEPS.map((step, index) => (
					<li key={step.title()} className="flex items-start gap-3">
						<span
							aria-hidden="true"
							className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground text-xs tabular-nums"
						>
							{index + 1}
						</span>
						<div className="flex flex-col gap-0.5">
							<p className="font-medium text-sm leading-tight">
								{step.title()}
							</p>
							<p className="text-pretty text-muted-foreground text-sm leading-snug">
								{step.desc()}
							</p>
						</div>
					</li>
				))}
			</ol>
			<Button
				variant="default"
				onClick={() => openOrgSettings("libraries", "create-library")}
			>
				{m["home.add_first_library"]()}
			</Button>
		</NoticeShell>
	);
}

/** Members and not-yet-joined visitors can't add content — tell them why the
 * library is empty and where to go next. */
function PassiveEmptyNotice({ hasOrg }: { hasOrg: boolean }): JSX.Element {
	return (
		<NoticeShell>
			<div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground shadow-card">
				<Books aria-hidden="true" className="size-7" />
			</div>
			<div className="flex max-w-md flex-col gap-1.5">
				<h2 className="text-balance font-semibold text-xl leading-tight">
					{m["home.no_books_title"]()}
				</h2>
				<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
					{hasOrg ? m["home.empty_member"]() : m["home.empty_no_server"]()}
				</p>
			</div>
			{!hasOrg && (
				<Link
					to="/dashboard/invitations"
					className={buttonVariants({ variant: "outline" })}
				>
					{m["home.view_invitations"]()}
				</Link>
			)}
		</NoticeShell>
	);
}

/** Home empty state: guides a new admin through connecting a library, shows
 * live progress while the first import runs, and tells members/guests why
 * there's nothing to see yet. */
export function EmptyLibraryNotice(): JSX.Element {
	const { data: session } = useSession();
	const { can } = useAbilities();

	const hasOrg = !!session?.session.activeOrganizationId;
	const canManageLibraries = can("library", "create");
	const activeImport = useActiveImport(hasOrg);

	if (activeImport) {
		return <ImportingNotice task={activeImport} />;
	}

	if (canManageLibraries) {
		return <GettingStartedNotice />;
	}

	return <PassiveEmptyNotice hasOrg={hasOrg} />;
}
