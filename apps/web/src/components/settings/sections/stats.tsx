import { useQuery } from "@tanstack/react-query";
import {
	SettingRow,
	SettingRows,
	SettingStatRow,
} from "@/components/settings/setting-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { formatFileSize } from "@/utils/format";
import { orpc } from "@/utils/orpc";

export function StatsSettings() {
	const { data: org } = authClient.useActiveOrganization();
	const { data: stats, isLoading } = useQuery(
		orpc.serverStats.get.queryOptions(),
	);

	const numberFormat = new Intl.NumberFormat(getLocale());
	const libraryValue = (bookCount: number, storageKb: number) =>
		`${numberFormat.format(bookCount)} · ${formatFileSize(storageKb) ?? "0 KB"}`;

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.stats.content"]()}
				</h2>
				<SettingRows>
					<SettingStatRow
						label={m["settings.stats.books"]()}
						value={stats?.ebookCount ?? 0}
						loading={isLoading}
					/>
					<SettingStatRow
						label={m["settings.stats.audiobooks"]()}
						value={stats?.audiobookCount ?? 0}
						loading={isLoading}
					/>
					<SettingStatRow
						label={m["settings.stats.series"]()}
						value={stats?.seriesCount ?? 0}
						loading={isLoading}
					/>
					<SettingStatRow
						label={m["settings.stats.authors"]()}
						value={stats?.authorCount ?? 0}
						loading={isLoading}
					/>
					<SettingStatRow
						label={m["settings.stats.collections"]()}
						value={stats?.collectionCount ?? 0}
						loading={isLoading}
					/>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.stats.libraries"]()}
				</h2>
				{isLoading ? (
					<LibraryRowsSkeleton />
				) : (
					<SettingRows>
						{stats?.libraries?.map((lib) => (
							<SettingRow
								key={lib.id}
								label={lib.name ?? m["library.untitled"]()}
								value={libraryValue(lib.bookCount, lib.storageKb)}
							/>
						))}
						{(stats?.libraries?.length ?? 0) > 1 && (
							<SettingRow
								label={m["settings.stats.total"]()}
								value={libraryValue(
									(stats?.ebookCount ?? 0) + (stats?.audiobookCount ?? 0),
									stats?.storageKb ?? 0,
								)}
							/>
						)}
					</SettingRows>
				)}
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.stats.people"]()}
				</h2>
				<SettingRows>
					<SettingStatRow
						label={m["settings.stats.members"]()}
						value={stats?.memberCount ?? 0}
						loading={isLoading}
					/>
					{org && (
						<SettingRow
							label={m["settings.org.created"]()}
							value={new Intl.DateTimeFormat(getLocale()).format(
								new Date(org.createdAt),
							)}
						/>
					)}
				</SettingRows>
			</section>
		</div>
	);
}

function LibraryRowsSkeleton() {
	return (
		<SettingRows>
			{["a", "b"].map((key) => (
				<div key={key} className="flex items-center justify-between py-3">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-5 w-28" />
				</div>
			))}
		</SettingRows>
	);
}
