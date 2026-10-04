/**
 * Performs independent preparation work with a bounded queue and returns
 * results in input order. Reader adapters use it to overlap ZIP reads without
 * turning a long spine into an unbounded memory/network burst.
 */
export async function mapConcurrent<T, TResult>(
	values: readonly T[],
	concurrency: number,
	map: (value: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	const limit = Math.max(1, Math.floor(concurrency));
	const results = Array<TResult>(values.length);
	let next = 0;
	const worker = async () => {
		while (next < values.length) {
			const index = next;
			next += 1;
			const value = values[index] as T;
			results[index] = await map(value, index);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, values.length) }, () => worker()),
	);
	return results;
}
