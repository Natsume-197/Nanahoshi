import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type RecentlyAddedBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor?: string | null;
	authors?: { id?: number | null; name: string }[];
};

type RecentlyAddedSectionProps = {
	books: RecentlyAddedBook[];
	prioritizeFirstCover: boolean;
};

export const RecentlyAddedSection = memo(function RecentlyAddedSection({
	books,
	prioritizeFirstCover,
}: RecentlyAddedSectionProps): JSX.Element {
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const hasOrg = !!activeOrg;

	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: hasOrg,
	});

	const isSystemAdmin = session?.user?.role === "admin";
	const orgMemberRole =
		myRoleData?.role ??
		activeOrg?.members?.find((m) => m.userId === session?.user?.id)?.role;
	const canManageLibraries =
		isSystemAdmin || orgMemberRole === "admin" || orgMemberRole === "owner";

	if (books.length === 0) {
		return (
			<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
					<BookOpen className="size-5" />
				</div>
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
						<Link to="/dashboard/settings/organization/libraries">
							<Button variant="outline" size="sm">
								Go to library settings
							</Button>
						</Link>
					)}
					{!hasOrg && !isSystemAdmin && (
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
						authors={book.authors}
						contextMenuEnabled={false}
						priority={prioritizeFirstCover && index === 0}
						coverPreset={coverPresets.small}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
});
