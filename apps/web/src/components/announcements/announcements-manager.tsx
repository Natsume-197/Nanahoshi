import { Badge } from "@nanahoshi/ui/components/badge";
import { Button } from "@nanahoshi/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@nanahoshi/ui/components/field";
import { Input } from "@nanahoshi/ui/components/input";
import { Modal } from "@nanahoshi/ui/components/modal";
import { Skeleton } from "@nanahoshi/ui/components/skeleton";
import { Switch } from "@nanahoshi/ui/components/switch";
import { Textarea } from "@nanahoshi/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@nanahoshi/ui/components/toggle-group";
import { cn } from "@nanahoshi/ui/lib/utils";
import { CircleNotch, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { client, orpc, queryClient } from "@/utils/orpc";
import {
	type AnnouncementStatus,
	announcementStatus,
	fromLocalInput,
	toLocalInput,
} from "./announcement-schedule";
import {
	type AnnouncementSeverity,
	AnnouncementStrip,
	SEVERITY_ICON,
} from "./announcement-strip";

export type AnnouncementScope = "instance" | "server";

type Announcement = {
	id: string;
	severity: AnnouncementSeverity;
	title: string;
	body: string | null;
	dismissible: boolean;
	startsAt: string | null;
	endsAt: string | null;
};

type Draft = {
	id: string | null;
	severity: AnnouncementSeverity;
	title: string;
	body: string;
	dismissible: boolean;
	startsAt: string;
	endsAt: string;
};

const SEVERITIES: { value: AnnouncementSeverity; label: () => string }[] = [
	{ value: "info", label: m["announcements.severity_info"] },
	{ value: "success", label: m["announcements.severity_success"] },
	{ value: "warning", label: m["announcements.severity_warning"] },
	{ value: "danger", label: m["announcements.severity_danger"] },
];

const STATUS_LABEL: Record<AnnouncementStatus, () => string> = {
	live: m["announcements.status_live"],
	scheduled: m["announcements.status_scheduled"],
	ended: m["announcements.status_ended"],
};

const STATUS_BADGE: Record<AnnouncementStatus, "success" | "info" | "outline"> =
	{ live: "success", scheduled: "info", ended: "outline" };

const emptyDraft = (): Draft => ({
	id: null,
	severity: "info",
	title: "",
	body: "",
	dismissible: true,
	startsAt: "",
	endsAt: "",
});

const toDraft = (a: Announcement): Draft => ({
	id: a.id,
	severity: a.severity,
	title: a.title,
	body: a.body ?? "",
	dismissible: a.dismissible,
	startsAt: toLocalInput(a.startsAt),
	endsAt: toLocalInput(a.endsAt),
});

function draftError(draft: Draft): string | null {
	if (!draft.title.trim()) return m["announcements.title_required"]();
	const start = fromLocalInput(draft.startsAt);
	const end = fromLocalInput(draft.endsAt);
	if (start && end && Date.parse(end) <= Date.parse(start))
		return m["announcements.ends_before_start"]();
	return null;
}

function formatRange(a: Announcement) {
	const fmt = new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const start = a.startsAt ? fmt.format(new Date(a.startsAt)) : null;
	const end = a.endsAt ? fmt.format(new Date(a.endsAt)) : null;
	if (start && end) return `${start} – ${end}`;
	if (start) return `${m["announcements.starts_at"]()} ${start}`;
	if (end) return `${m["announcements.ends_at"]()} ${end}`;
	return null;
}

/**
 * Create, edit and delete banners for one scope: the whole instance (app
 * owner) or the active server (members who can update its settings).
 */
export function AnnouncementsManager({ scope }: { scope: AnnouncementScope }) {
	const api =
		scope === "instance"
			? orpc.announcements.instance
			: orpc.announcements.server;
	const rpc =
		scope === "instance"
			? client.announcements.instance
			: client.announcements.server;
	const listKey = api.list.queryOptions().queryKey;
	const { data, isPending } = useQuery(api.list.queryOptions());
	const [draft, setDraft] = useState<Draft | null>(null);
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const [deleting, setDeleting] = useState<Announcement | null>(null);

	const refresh = () =>
		invalidateEverywhere(queryClient, [
			listKey,
			orpc.announcements.active.queryOptions().queryKey,
		]);

	const save = useMutation({
		mutationFn: (d: Draft) => {
			const fields = {
				severity: d.severity,
				title: d.title.trim(),
				body: d.body.trim() || null,
				dismissible: d.dismissible,
				startsAt: fromLocalInput(d.startsAt),
				endsAt: fromLocalInput(d.endsAt),
			};
			return d.id ? rpc.update({ id: d.id, fields }) : rpc.create(fields);
		},
		onSuccess: (_row, d) => {
			toast.success(
				d.id ? m["announcements.updated"]() : m["announcements.created"](),
			);
			setDraft(null);
			setSubmitAttempted(false);
			void refresh();
		},
		onError: (err) => toast.error(err.message),
	});

	const remove = useMutation({
		mutationFn: (id: string) => rpc.delete({ id }),
		onSuccess: () => {
			toast.success(m["announcements.deleted"]());
			setDeleting(null);
			void refresh();
		},
		onError: (err) => toast.error(err.message),
	});

	const error = draft ? draftError(draft) : null;
	const update = (patch: Partial<Draft>) =>
		setDraft((d) => (d ? { ...d, ...patch } : d));
	const now = Date.now();
	const rows = (data ?? []) as Announcement[];

	return (
		<section className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Button type="button" onClick={() => setDraft(emptyDraft())}>
					<Plus data-icon="inline-start" aria-hidden="true" />
					{m["announcements.new"]()}
				</Button>
			</div>

			{isPending ? (
				<Skeleton className="h-20 w-full rounded-2xl" />
			) : rows.length === 0 ? (
				<p className="max-w-xl text-pretty text-muted-foreground text-sm">
					{scope === "instance"
						? m["announcements.empty_instance"]()
						: m["announcements.empty_server"]()}
				</p>
			) : (
				<ul className="flex flex-col gap-5">
					{rows.map((a) => {
						const status = announcementStatus(a, now);
						const range = formatRange(a);
						return (
							<li key={a.id} className="flex flex-col gap-2">
								<AnnouncementStrip
									severity={a.severity}
									title={a.title}
									body={a.body}
									onDismiss={a.dismissible ? () => {} : undefined}
									className={cn(
										"pointer-events-none rounded-xl",
										status === "ended" && "opacity-60",
									)}
								/>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
									<Badge variant={STATUS_BADGE[status]}>
										{STATUS_LABEL[status]()}
									</Badge>
									{range && (
										<span className="text-muted-foreground text-xs">
											{range}
										</span>
									)}
									<div className="ms-auto flex gap-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setDraft(toDraft(a))}
										>
											{m["common.edit"]()}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive"
											onClick={() => setDeleting(a)}
										>
											{m["common.delete"]()}
										</Button>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<Modal
				open={draft !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDraft(null);
						setSubmitAttempted(false);
					}
				}}
				title={draft?.id ? m["announcements.edit"]() : m["announcements.new"]()}
				className="sm:max-w-lg"
				onSubmit={(event) => {
					event.preventDefault();
					setSubmitAttempted(true);
					if (draft && !error) save.mutate(draft);
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDraft(null)}
							disabled={save.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={save.isPending}
							aria-busy={save.isPending || undefined}
						>
							{save.isPending && (
								<CircleNotch
									aria-hidden="true"
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				{draft && (
					<div className="flex flex-col gap-5">
						<FieldSet>
							<FieldLegend variant="label">
								{m["announcements.severity"]()}
							</FieldLegend>
							<ToggleGroup
								value={[draft.severity]}
								onValueChange={(values) => {
									const next = values[0] as AnnouncementSeverity | undefined;
									if (next) update({ severity: next });
								}}
								variant="segmented"
								spacing={1}
								className="grid w-full grid-cols-2 sm:grid-cols-4"
								aria-label={m["announcements.severity"]()}
							>
								{SEVERITIES.map(({ value, label }) => {
									const Icon = SEVERITY_ICON[value];
									return (
										<ToggleGroupItem
											key={value}
											value={value}
											className="gap-1.5"
										>
											<Icon data-icon="inline-start" aria-hidden="true" />
											{label()}
										</ToggleGroupItem>
									);
								})}
							</ToggleGroup>
						</FieldSet>

						<Field
							data-invalid={
								(submitAttempted && !draft.title.trim()) || undefined
							}
						>
							<FieldLabel htmlFor="announcement-title">
								{m["announcements.title"]()}
							</FieldLabel>
							<Input
								id="announcement-title"
								value={draft.title}
								maxLength={120}
								autoFocus
								onChange={(e) => update({ title: e.target.value })}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="announcement-body">
								{m["announcements.body"]()}
							</FieldLabel>
							<Textarea
								id="announcement-body"
								value={draft.body}
								maxLength={2000}
								rows={3}
								placeholder={m["announcements.body_placeholder"]()}
								onChange={(e) => update({ body: e.target.value })}
							/>
						</Field>

						<Field orientation="horizontal" className="justify-between">
							<div className="flex flex-col gap-1">
								<FieldLabel htmlFor="announcement-dismissible">
									{m["announcements.dismissible"]()}
								</FieldLabel>
								<FieldDescription>
									{m["announcements.dismissible_desc"]()}
								</FieldDescription>
							</div>
							<Switch
								id="announcement-dismissible"
								checked={draft.dismissible}
								onCheckedChange={(dismissible) => update({ dismissible })}
							/>
						</Field>

						<FieldSet>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="announcement-starts">
										{m["announcements.starts_at"]()}
									</FieldLabel>
									<Input
										id="announcement-starts"
										type="datetime-local"
										value={draft.startsAt}
										onChange={(e) => update({ startsAt: e.target.value })}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="announcement-ends">
										{m["announcements.ends_at"]()}
									</FieldLabel>
									<Input
										id="announcement-ends"
										type="datetime-local"
										value={draft.endsAt}
										onChange={(e) => update({ endsAt: e.target.value })}
									/>
								</Field>
							</div>
							<FieldDescription>
								{m["announcements.schedule_hint"]()}
							</FieldDescription>
						</FieldSet>

						{submitAttempted && error && <FieldError>{error}</FieldError>}

						<div className="flex flex-col gap-2">
							<span className="text-muted-foreground text-xs">
								{m["announcements.preview"]()}
							</span>
							<AnnouncementStrip
								severity={draft.severity}
								title={draft.title.trim() || m["announcements.title"]()}
								body={draft.body.trim() || null}
								onDismiss={draft.dismissible ? () => {} : undefined}
								className="pointer-events-none rounded-xl"
							/>
						</div>
					</div>
				)}
			</Modal>

			<Modal
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title={m["announcements.delete_title"]()}
				description={m["announcements.delete_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDeleting(null)}
							disabled={remove.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => deleting && remove.mutate(deleting.id)}
						>
							{m["common.delete"]()}
						</Button>
					</>
				}
			/>
		</section>
	);
}
