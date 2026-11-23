import { Button } from "@nanahoshi/ui/components/button";
import { useInterval } from "@nanahoshi/ui/hooks/use-interval";
import { CheckCircle, DeviceMobile, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useState } from "react";
import { getApiOrigin } from "@/lib/api-origin";
import { authClient } from "@/lib/auth-client";
import {
	formatCountdown,
	isLoopbackOrigin,
	PLAY_STORE_URL,
	pairAppLink,
} from "@/lib/mobile-connect-link";
import { m } from "@/paraglide/messages";

type Ticket = { token: string; expiresAt: string };
type PairingStatus = "pending" | "paired" | "expired";

async function createTicket(): Promise<Ticket> {
	const { data, error } = await authClient.$fetch<Ticket>(
		"/mobile-connect/create",
		{ method: "POST" },
	);
	if (error || !data) throw new Error(m["settings.mobile.generate_failed"]());
	return data;
}

async function fetchStatus(token: string): Promise<PairingStatus> {
	const { data } = await authClient.$fetch<{ status: PairingStatus }>(
		"/mobile-connect/status",
		{ method: "POST", body: { token } },
	);
	return data?.status ?? "pending";
}

/** "Connect a phone": a QR the Nanahoshi app scans to sign in on its own. */
export function MobileConnectSettings() {
	const server = getApiOrigin();
	const unreachable = isLoopbackOrigin(server);
	const create = useMutation({ mutationFn: createTicket });
	const ticket = create.data;

	return (
		<div className="flex flex-col gap-8">
			<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
				{m["settings.mobile.desc"]()}
			</p>
			{unreachable && (
				<p
					role="alert"
					className="flex max-w-2xl gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed"
				>
					<Warning aria-hidden className="mt-0.5 size-4 shrink-0" />
					{m["settings.mobile.loopback_warning"]({
						host: new URL(server).host,
					})}
				</p>
			)}
			{ticket ? (
				<PairingCode
					key={ticket.token}
					server={server}
					ticket={ticket}
					onRenew={() => create.mutate()}
					renewing={create.isPending}
				/>
			) : (
				<div className="flex flex-col items-start gap-2">
					<Button onClick={() => create.mutate()} disabled={create.isPending}>
						<DeviceMobile aria-hidden />
						{m["settings.mobile.generate"]()}
					</Button>
					{create.isError && (
						<p role="alert" className="text-destructive text-sm">
							{create.error.message}
						</p>
					)}
				</div>
			)}
			{PLAY_STORE_URL && <GetTheApp storeUrl={PLAY_STORE_URL} />}
		</div>
	);
}

/** Before any code: a QR for the store, for a phone without the app yet. */
function GetTheApp({ storeUrl }: { storeUrl: string }) {
	const [open, setOpen] = useState(false);
	const qr = useQuery({
		queryKey: ["mobile-connect-store-qr"],
		queryFn: () => QRCode.toDataURL(storeUrl, { margin: 1, width: 320 }),
		enabled: open,
		staleTime: Number.POSITIVE_INFINITY,
	});
	return (
		<details
			className="max-w-2xl"
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary className="cursor-pointer text-muted-foreground text-sm hover:text-foreground">
				{m["settings.mobile.no_app"]()}
			</summary>
			<div className="mt-4 flex items-center gap-5">
				<div className="size-32 shrink-0 overflow-hidden rounded-xl bg-white p-2">
					{qr.data && (
						<img
							src={qr.data}
							alt={m["settings.mobile.store_qr_label"]()}
							className="size-full [image-rendering:pixelated]"
						/>
					)}
				</div>
				<div className="flex flex-col items-start gap-2">
					<p className="text-muted-foreground text-sm">
						{m["settings.mobile.no_app_desc"]()}
					</p>
					<Button asChild variant="outline" size="sm">
						<a href={storeUrl} target="_blank" rel="noreferrer">
							{m["settings.mobile.open_store"]()}
						</a>
					</Button>
				</div>
			</div>
		</details>
	);
}

function PairingCode({
	server,
	ticket,
	onRenew,
	renewing,
}: {
	server: string;
	ticket: Ticket;
	onRenew: () => void;
	renewing: boolean;
}) {
	const expiresAt = Date.parse(ticket.expiresAt);
	const [now, setNow] = useState(Date.now);
	useInterval(() => setNow(Date.now()), 1000);
	const remaining = expiresAt - now;

	const status = useQuery({
		queryKey: ["mobile-connect-status", ticket.token],
		queryFn: () => fetchStatus(ticket.token),
		refetchInterval: (query) =>
			query.state.data === "paired" || query.state.data === "expired"
				? false
				: 2000,
	});
	const qr = useQuery({
		queryKey: ["mobile-connect-qr", ticket.token],
		queryFn: () =>
			QRCode.toDataURL(pairAppLink(server, ticket.token), {
				margin: 1,
				width: 512,
				errorCorrectionLevel: "M",
			}),
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (status.data === "paired") {
		return (
			<div className="flex max-w-md flex-col items-start gap-4">
				<div className="flex items-start gap-3">
					<CheckCircle
						aria-hidden
						weight="fill"
						className="mt-0.5 size-6 shrink-0 text-primary"
					/>
					<div className="flex flex-col gap-1" aria-live="polite">
						<h3 className="font-semibold text-base">
							{m["settings.mobile.paired"]()}
						</h3>
						<p className="text-muted-foreground text-sm">
							{m["settings.mobile.paired_desc"]()}
						</p>
					</div>
				</div>
				<Button variant="outline" onClick={onRenew} disabled={renewing}>
					{m["settings.mobile.connect_another"]()}
				</Button>
			</div>
		);
	}

	const expired = remaining <= 0 || status.data === "expired";
	return (
		<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
			<div className="relative size-56 shrink-0 overflow-hidden rounded-2xl bg-white p-3 shadow-card">
				{qr.data && (
					<img
						src={qr.data}
						alt={m["settings.mobile.qr_label"]()}
						className={
							expired
								? "size-full opacity-15 blur-[2px]"
								: "size-full [image-rendering:pixelated]"
						}
					/>
				)}
			</div>
			<div className="flex flex-col gap-5">
				<ol className="flex flex-col gap-3 text-sm">
					{[
						m["settings.mobile.step1"](),
						m["settings.mobile.step2"](),
						m["settings.mobile.step3"](),
					].map((step, index) => (
						<li key={step} className="flex items-center gap-3">
							<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-medium text-xs tabular-nums">
								{index + 1}
							</span>
							{step}
						</li>
					))}
				</ol>
				<div className="flex items-center gap-3">
					<span
						className="text-muted-foreground text-sm tabular-nums"
						aria-live="polite"
					>
						{expired
							? m["settings.mobile.expired"]()
							: m["settings.mobile.expires_in"]({
									time: formatCountdown(remaining),
								})}
					</span>
					<Button
						size="sm"
						variant={expired ? "default" : "outline"}
						onClick={onRenew}
						disabled={renewing}
					>
						{m["settings.mobile.new_code"]()}
					</Button>
				</div>
			</div>
		</div>
	);
}
