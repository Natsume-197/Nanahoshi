import { bookIndexQueue } from "../queues/book-index.queue";

export async function scheduleBookIndex() {
	// ┌────────────── second (optional)
	// │ ┌──────────── minute
	// │ │ ┌────────── hour
	// │ │ │ ┌──────── day of month
	// │ │ │ │ ┌────── month
	// │ │ │ │ │ ┌──── day of week
	// │ │ │ │ │ │
	// │ │ │ │ │ │
	// * * * * * *
	await bookIndexQueue.add(
		"reindex",
		{},
		{
			repeat: { pattern: "* 1 * * * *" },
			removeOnComplete: true,
			removeOnFail: false,
		},
	);
}
