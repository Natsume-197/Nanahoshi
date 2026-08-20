import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const playerContext = readFileSync(
	new URL("../../context/audio-player-context.tsx", import.meta.url),
	"utf8",
);
const readerScreen = readFileSync(
	new URL("../../features/reader/reader-screen.tsx", import.meta.url),
	"utf8",
);

describe("activity lifecycle wiring", () => {
	test("renews listening presence only during real playback", () => {
		expect(playerContext).toContain(
			"enabled: !!audiobook && isPlaying && !isLoading",
		);
		expect(playerContext).not.toContain("hasMarkedListeningRef");
	});

	test("keeps idle reconciliation active in the full-page reader", () => {
		expect(readerScreen).toContain("usePresenceIdle();");
	});
});
