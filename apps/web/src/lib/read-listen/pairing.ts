type PairingWithAlignment = {
	alignment: { status: string };
};

/** A stale or missing alignment cannot start an interactive reader session. */
export function findReadyReadListenPairing<
	TPairing extends PairingWithAlignment,
>(pairings: readonly TPairing[] | undefined): TPairing | undefined {
	return pairings?.find((pairing) => pairing.alignment.status === "ready");
}
