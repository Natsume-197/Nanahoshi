import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const RecentlyAddedSection = memo(
	function RecentlyAddedSection(): JSX.Element | null {
		const { data: books, isLoading } = useQuery(
			orpc.books.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		const { data: activeOrg } = authClient.useActiveOrganization();
		const { can } = useAbilities();
		const { openOrgSettings } = useSettingsModal();

		if (isLoading) return <SectionSkeleton />;

		const hasOrg = !!activeOrg;
		const canManageLibraries = can("library", "create");

		if (!books || books.length === 0) {
			return (
				<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-lg">No books yet</h2>
						<p className="max-w-md text-muted-foreground text-sm">
							{canManageLibraries
								? "Add a library path in settings to start scanning your books."
								: hasOrg
									? "The library is empty. Contact an administrator to add books."
									: "You're not part of any organization yet. Accept an invitation to get started."}
						</p>
					</div>
					<div className="mt-2 flex gap-2">
						{canManageLibraries && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => openOrgSettings("libraries")}
							>
								Go to library settings
							</Button>
						)}
						{!hasOrg && (
							<Link to="/dashboard/invitations">
								<Button variant="outline" size="sm">
									View invitations
								</Button>
							</Link>
						)}
					</div>
				</div>
			);
		}

		return (
			<ScrollSection title="Recently added books">
				{books.map((book, index) => (
					<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							mainColor={book.mainColor}
							authors={book.authors}
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
