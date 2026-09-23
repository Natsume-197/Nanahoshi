import { ArrowSquareOut, Bug, GithubLogo } from "@phosphor-icons/react";
import { SettingRow, SettingRows } from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

const PROJECT_URL = "https://github.com/Natsume-197/Nanahoshi";
const RELEASES_URL = `${PROJECT_URL}/releases`;
const ISSUES_URL = `${PROJECT_URL}/issues/new`;
const LICENSE_URL = `${PROJECT_URL}/blob/main/LICENSE`;
const release = import.meta.env.VITE_NANAHOSHI_RELEASE;
const commit = import.meta.env.VITE_NANAHOSHI_COMMIT;

export function AboutSettings() {
	const releaseLabel =
		release && release !== "development"
			? release
			: m["settings.about.development"]();
	const commitLabel = commit
		? commit.slice(0, 7)
		: m["settings.about.unavailable"]();
	const releaseUrl =
		release && release !== "development"
			? `${RELEASES_URL}/tag/${encodeURIComponent(release)}`
			: RELEASES_URL;

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex items-center gap-4">
					<img
						src="/logo.svg"
						alt=""
						className="size-16 rounded-[22%] shadow-sm ring-1 ring-border"
					/>
					<div className="min-w-0">
						<h2 className="font-semibold text-2xl text-foreground">
							Nanahoshi
						</h2>
						<p className="max-w-2xl text-pretty text-muted-foreground text-sm">
							{m["settings.about.tagline"]()}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline">
						<a href={PROJECT_URL} target="_blank" rel="noreferrer">
							<GithubLogo data-icon="inline-start" aria-hidden="true" />
							{m["settings.about.source_code"]()}
						</a>
					</Button>
					<Button asChild variant="outline">
						<a href={RELEASES_URL} target="_blank" rel="noreferrer">
							{m["settings.about.whats_new"]()}
							<ArrowSquareOut data-icon="inline-end" aria-hidden="true" />
						</a>
					</Button>
					<Button asChild variant="outline">
						<a href={ISSUES_URL} target="_blank" rel="noreferrer">
							<Bug data-icon="inline-start" aria-hidden="true" />
							{m["settings.about.report_issue"]()}
						</a>
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.about.build_info"]()}
				</h2>
				<SettingRows>
					<SettingRow
						label={m["settings.about.release"]()}
						value={
							<a
								href={releaseUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:underline"
							>
								{releaseLabel}
								<ArrowSquareOut className="size-3.5 text-muted-foreground" />
							</a>
						}
					/>
					<SettingRow
						label={m["settings.about.commit"]()}
						value={
							commit ? (
								<a
									href={`${PROJECT_URL}/commit/${commit}`}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 font-mono hover:underline"
								>
									{commitLabel}
									<ArrowSquareOut className="size-3.5 text-muted-foreground" />
								</a>
							) : (
								commitLabel
							)
						}
					/>
					<SettingRow
						label={m["settings.about.license"]()}
						value={
							<a
								href={LICENSE_URL}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:underline"
							>
								PolyForm Shield 1.0.0
								<ArrowSquareOut className="size-3.5 text-muted-foreground" />
							</a>
						}
					/>
				</SettingRows>
			</section>
		</div>
	);
}
