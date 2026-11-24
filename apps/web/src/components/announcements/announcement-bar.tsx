import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
import { AnnouncementStrip } from "./announcement-strip";

const activeQuery = () =>
	orpc.announcements.active.queryOptions({
		// No push channel: pick up new or expired banners on focus and every few minutes.
		refetchOnWindowFocus: true,
		refetchInterval: 5 * 60_000,
	});

/** Top-of-window strip with the instance's and active server's live announcements, one at a time. */
export function AnnouncementBar() {
	const { data } = useQuery(activeQuery());
	const [index, setIndex] = useState(0);
	const dismiss = useMutation({
		...orpc.announcements.dismiss.mutationOptions(),
		onMutate: ({ id }) => {
			const key = activeQuery().queryKey;
			const previous = queryClient.getQueryData(key);
			queryClient.setQueryData(key, (rows) =>
				rows?.filter((row) => row.id !== id),
			);
			return { previous };
		},
		onError: (err, _input, ctx) => {
			if (ctx?.previous)
				queryClient.setQueryData(activeQuery().queryKey, ctx.previous);
			toast.error(err.message);
		},
	});

	if (!data?.length) return null;
	const count = data.length;
	// Clamp, since dismissing the last one shrinks the list under the index.
	const current = Math.min(index, count - 1);
	const a = data[current];
	if (!a) return null;

	return (
		<section
			aria-label={m["announcements.nav"]()}
			aria-roledescription="carousel"
			className="shrink-0"
		>
			<AnnouncementStrip
				key={a.id}
				severity={a.severity}
				title={a.title}
				body={a.body}
				pager={{
					index: current,
					count,
					onPrev: () => setIndex((current - 1 + count) % count),
					onNext: () => setIndex((current + 1) % count),
				}}
				onDismiss={
					a.dismissible ? () => dismiss.mutate({ id: a.id }) : undefined
				}
			/>
		</section>
	);
}
