import { Button } from "@nanahoshi/ui/components/button";
import { Modal } from "@nanahoshi/ui/components/modal";
import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { m } from "@/paraglide/messages";
import { BUNDLE_RELEASE } from "./use-updates";
import {
	decideWhatsNew,
	type WhatsNewEntry,
	whatsNewCatalog,
	whatsNewStorageKey,
} from "./whats-new";

const RELEASES_URL = "https://github.com/Natsume-197/Nanahoshi/releases";

const GROUP_LABEL = {
	added: () => m["whatsnew.group_added"](),
	changed: () => m["whatsnew.group_changed"](),
	fixed: () => m["whatsnew.group_fixed"](),
} as const;

/**
 * Opens once after this browser first runs a newer release, with the notes of
 * every release since the last one it saw. Mount it keyed by user, so each
 * person on a shared browser keeps their own place.
 */
export function WhatsNewOnUpdate({ userId }: { userId: string }) {
	const [entries, setEntries] = useState<WhatsNewEntry[]>([]);

	// Local storage is an external system read once on mount; the server
	// render never knows it, so deciding here keeps hydration identical.
	useMountEffect(() => {
		const key = whatsNewStorageKey(userId);
		let seen: string | null = null;
		try {
			seen = window.localStorage.getItem(key);
		} catch {
			return;
		}
		const decision = decideWhatsNew(whatsNewCatalog(), seen, BUNDLE_RELEASE);
		if (decision.marker) {
			try {
				// Saved before showing: a reload never shows the same notes twice.
				window.localStorage.setItem(key, decision.marker);
			} catch {
				return;
			}
		}
		if (decision.show) setEntries(decision.entries);
	});

	return (
		<WhatsNewDialog
			entries={entries}
			open={entries.length > 0}
			onOpenChange={(open) => {
				if (!open) setEntries([]);
			}}
		/>
	);
}

export function WhatsNewDialog({
	entries,
	open,
	onOpenChange,
}: {
	entries: WhatsNewEntry[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["whatsnew.title"]()}
			footer={
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					<Button asChild variant="ghost">
						<a href={RELEASES_URL} target="_blank" rel="noreferrer">
							{m["whatsnew.all_releases"]()}
							<ArrowSquareOut data-icon="inline-end" aria-hidden="true" />
						</a>
					</Button>
					<Button onClick={() => onOpenChange(false)}>
						{m["whatsnew.close"]()}
					</Button>
				</div>
			}
		>
			<div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto pe-1">
				{entries.map((entry) => (
					<article key={entry.version} className="flex flex-col gap-3">
						<header className="flex items-baseline gap-2">
							<h3 className="font-semibold text-base text-foreground">
								{entry.version}
							</h3>
							<span className="text-muted-foreground text-xs">
								{entry.date}
							</span>
						</header>
						{entry.notices.length > 0 && (
							<div className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
								<p className="flex items-center gap-1.5 font-medium text-foreground">
									<Warning aria-hidden="true" className="size-4 text-warning" />
									{m["whatsnew.notices"]()}
								</p>
								{entry.notices.map((notice) => (
									<p key={notice} className="text-foreground/90">
										{notice}
									</p>
								))}
							</div>
						)}
						{entry.groups.map((group) => (
							<section key={group.type} className="flex flex-col gap-1.5">
								<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									{GROUP_LABEL[group.type]()}
								</h4>
								<ul className="flex list-disc flex-col gap-1.5 ps-5 text-foreground/90 text-sm">
									{group.items.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</section>
						))}
					</article>
				))}
			</div>
		</Modal>
	);
}
