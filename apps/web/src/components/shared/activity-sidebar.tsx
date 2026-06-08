import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export function ActivitySidebar() {
	return (
		<aside className="hidden w-full shrink-0 flex-col gap-4 lg:sticky lg:top-8 lg:flex lg:w-80 lg:self-start">
			<SuggestionsCard />
		</aside>
	);
}

function SuggestionsCard() {
	const suggestionsQuery = useQuery(
		orpc.follow.getSuggestions.queryOptions({ input: { limit: 5 } }),
	);

	const suggestions = suggestionsQuery.data;

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="text-sm">Who to follow</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-1">
				{suggestionsQuery.isLoading ? (
					<div className="flex flex-col gap-3">
						{[0, 1, 2].map((i) => (
							<div key={i} className="flex items-center gap-2.5">
								<Skeleton className="size-9 rounded-full" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-3 w-24" />
									<Skeleton className="h-2.5 w-16" />
								</div>
							</div>
						))}
					</div>
				) : !suggestions || suggestions.length === 0 ? (
					<p className="py-2 text-center text-muted-foreground text-sm">
						No suggestions right now.
					</p>
				) : (
					suggestions.map((s) => <SuggestionRow key={s.id} user={s} />)
				)}
			</CardContent>
		</Card>
	);
}

type Suggestion = {
	id: string;
	name: string;
	username: string;
	displayUsername: string | null;
	image: string | null;
	followerCount: number;
};

function SuggestionRow({ user }: { user: Suggestion }) {
	const queryClient = useQueryClient();

	const followMutation = useMutation({
		mutationFn: () => client.follow.follow({ username: user.username }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.follow.getSuggestions.key(),
			});
			toast.success(`Following ${user.name}`);
		},
		onError: () => toast.error("Failed to follow"),
	});

	return (
		<div className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
			<Link
				to="/dashboard/user/$username"
				params={{ username: user.username }}
				className="shrink-0"
				aria-label={`${user.name}'s profile`}
			>
				<UserAvatar
					name={user.name}
					image={user.image}
					className="size-9"
					fallbackClassName="text-xs"
				/>
			</Link>
			<div className="flex min-w-0 flex-1 flex-col">
				<Link
					to="/dashboard/user/$username"
					params={{ username: user.username }}
					className="truncate font-medium text-foreground text-sm leading-tight hover:underline"
					title={user.name}
				>
					{user.name}
				</Link>
				<span className="truncate text-muted-foreground text-xs">
					{user.followerCount === 1
						? "1 follower"
						: `${formatNumber(user.followerCount)} followers`}
				</span>
			</div>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0 gap-1.5"
				onClick={() => followMutation.mutate()}
				disabled={followMutation.isPending}
			>
				<UserPlus className="size-3.5" />
				Follow
			</Button>
		</div>
	);
}
