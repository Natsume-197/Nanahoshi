export interface ReaderE2ERect {
	top: number;
	right: number;
	bottom: number;
	left: number;
	width: number;
	height: number;
}

export interface TategakiPublicationInsets {
	htmlMarginTop: number;
	htmlMarginBottom: number;
	htmlPaddingTop: number;
	htmlPaddingBottom: number;
	bodyMarginTop: number;
	bodyMarginBottom: number;
	bodyPaddingTop: number;
	bodyPaddingBottom: number;
}

export interface TategakiLayoutSnapshot {
	viewport: { width: number; height: number };
	route: ReaderE2ERect;
	frame: ReaderE2ERect;
	surface: ReaderE2ERect;
	publicationInsets: TategakiPublicationInsets;
}

export interface MiniplayerTategakiLayoutSnapshot
	extends TategakiLayoutSnapshot {
	player: ReaderE2ERect;
}

const GEOMETRY_TOLERANCE_PX = 2;

function rounded(value: number) {
	return Math.round(value * 100) / 100;
}

function assertAtMost(
	value: number,
	maximum: number,
	message: (actual: number) => string,
) {
	if (value > maximum) throw new Error(message(rounded(value)));
}

/** Browser-layout contract for paginated vertical text at 0% vertical padding. */
export function assertZeroPaddingTategakiLayout(
	snapshot: TategakiLayoutSnapshot,
) {
	const topGap = snapshot.surface.top - snapshot.route.top;
	const bottomGap = snapshot.route.bottom - snapshot.surface.bottom;
	assertAtMost(
		Math.abs(topGap),
		GEOMETRY_TOLERANCE_PX,
		(actual) => `Tategaki surface has a ${actual}px top gap at 0% padding.`,
	);
	assertAtMost(
		Math.abs(bottomGap),
		GEOMETRY_TOLERANCE_PX,
		(actual) => `Tategaki surface has a ${actual}px bottom gap at 0% padding.`,
	);

	const frameTopGap = snapshot.frame.top - snapshot.route.top;
	const frameBottomGap = snapshot.route.bottom - snapshot.frame.bottom;
	assertAtMost(
		Math.abs(frameTopGap),
		GEOMETRY_TOLERANCE_PX,
		(actual) => `Tategaki frame has a ${actual}px top gap.`,
	);
	assertAtMost(
		Math.abs(frameBottomGap),
		GEOMETRY_TOLERANCE_PX,
		(actual) => `Tategaki frame has a ${actual}px bottom gap.`,
	);

	for (const [name, inset] of Object.entries(snapshot.publicationInsets)) {
		assertAtMost(
			Math.abs(inset),
			GEOMETRY_TOLERANCE_PX,
			(actual) => `Publication ${name} is ${actual}px at 0% vertical padding.`,
		);
	}
}

/** The player owns the area below the reader; neither side may reserve it twice. */
export function assertMiniplayerTategakiLayout(
	snapshot: MiniplayerTategakiLayoutSnapshot,
) {
	assertZeroPaddingTategakiLayout(snapshot);
	const playerGap = snapshot.player.top - snapshot.route.bottom;
	assertAtMost(
		Math.abs(playerGap),
		GEOMETRY_TOLERANCE_PX,
		(actual) => `Reader and miniplayer have a ${actual}px vertical gap.`,
	);
	if (snapshot.player.height <= GEOMETRY_TOLERANCE_PX) {
		throw new Error("The miniplayer has no visible height.");
	}
}
