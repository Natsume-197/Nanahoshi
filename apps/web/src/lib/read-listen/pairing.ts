type PairingWithAlignment = {
	alignment: { status: string };
};

/** A stale or missing alignment cannot start an interactive reader session. */
export function findReadyReadListenPairing<
	TPairing extends PairingWithAlignment,
>(pairings: readonly TPairing[] | undefined): TPairing | undefined {
	return findReadyReadListenPairings(pairings)[0];
}

/** Returns every usable relationship so callers never silently discard editions. */
export function findReadyReadListenPairings<
	TPairing extends PairingWithAlignment,
>(pairings: readonly TPairing[] | undefined): TPairing[] {
	return (
		pairings?.filter((pairing) => pairing.alignment.status === "ready") ?? []
	);
}

/** One pairing is unambiguous; multiple pairings require an explicit choice. */
export function resolveReadListenPairingChoice<TPairing extends { id: string }>(
	pairings: readonly TPairing[],
	selectedPairingId: string | null,
): TPairing | undefined {
	return (
		pairings.find((pairing) => pairing.id === selectedPairingId) ??
		(pairings.length === 1 ? pairings[0] : undefined)
	);
}
