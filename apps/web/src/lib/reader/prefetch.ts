type NetworkInformation = {
	saveData?: boolean;
	effectiveType?: string;
};

/** Large reader files never prefetch on Data Saver or constrained networks. */
export function shouldSkipReaderPrefetch(
	connection: NetworkInformation | undefined = typeof navigator === "undefined"
		? undefined
		: (
				navigator as Navigator & {
					connection?: NetworkInformation;
				}
			).connection,
): boolean {
	if (!connection) return false;
	if (connection.saveData) return true;
	return (
		connection.effectiveType === "slow-2g" || connection.effectiveType === "2g"
	);
}
