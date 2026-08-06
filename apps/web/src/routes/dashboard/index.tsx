import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	beforeLoad: function beforeLoad({ context }) {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async ({ context }) => {
		if (typeof window === "undefined") return;
		// Await the two in-progress lists so the resume hero — and the color wash
		// it hands the navbar — paint on first render instead of popping in a beat
		// after the page loads. Only the FIRST visit blocks: once cached, returning
		// to home renders instantly from cache while stale data revalidates in the
		// background (progress mutations invalidate these keys anyway).
		const resumeOptions = continueReadingQueryOptions();
		const listeningOptions = orpc.listeningProgress.listInProgress.queryOptions(
			{
				input: { limit: DASHBOARD_LIMIT },
			},
		);
		// Availability joins the blocking set: it decides whether the format chips
		// exist at all, so resolving it late would shift the whole page down a row
		// the moment it lands.
		const formatsOptions = orpc.books.availableFormats.queryOptions({
			staleTime: 60_000,
		});
		const hasCachedHero =
			context.queryClient.getQueryData(resumeOptions.queryKey) !== undefined &&
			context.queryClient.getQueryData(listeningOptions.queryKey) !==
				undefined &&
			context.queryClient.getQueryData(formatsOptions.queryKey) !== undefined;
		const heroReady = Promise.all([
			context.queryClient.ensureQueryData({
				...resumeOptions,
				revalidateIfStale: true,
			}),
			context.queryClient.ensureQueryData({
				...listeningOptions,
				revalidateIfStale: true,
			}),
			context.queryClient.ensureQueryData(formatsOptions),
		]);
		if (!hasCachedHero) {
			await heroReady;
		} else {
			// Background revalidation: failures surface via the query cache's own
			// error handling, not as an unhandled rejection here.
			heroReady.catch(() => {});
		}
		context.queryClient.prefetchQuery(
			orpc.books.listRecent.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
		);
		context.queryClient.prefetchQuery(
			orpc.audiobooks.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.series.list.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.audiobooks.listSeries.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery({
			...orpc.books.listRandom.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
			staleTime: Number.POSITIVE_INFINITY,
		});
		context.queryClient.prefetchQuery({
			...orpc.audiobooks.listRandom.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
			staleTime: Number.POSITIVE_INFINITY,
		});
	},
});

function DashboardHome() {
	return <DashboardHomeContent />;
}
