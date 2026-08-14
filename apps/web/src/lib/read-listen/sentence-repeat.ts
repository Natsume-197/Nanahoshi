export type SentenceRepeatMode = "off" | "once" | "loop";

export function nextSentenceRepeatMode(
	mode: SentenceRepeatMode,
): SentenceRepeatMode {
	if (mode === "off") return "once";
	if (mode === "once") return "loop";
	return "off";
}

export function resolveSentenceRepeatBoundary({
	mode,
	playheadMs,
	cueEndMs,
	loopSeekPending,
}: {
	mode: SentenceRepeatMode;
	playheadMs: number;
	cueEndMs: number;
	loopSeekPending: boolean;
}): "none" | "finish" | "loop" {
	if (mode === "off" || playheadMs < cueEndMs) return "none";
	if (mode === "once") return "finish";
	return loopSeekPending ? "none" : "loop";
}
