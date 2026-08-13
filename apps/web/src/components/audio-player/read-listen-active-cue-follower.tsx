import { useMountEffect } from "@/hooks/use-mount-effect";

type ScrollToIndex = (
	index: number,
	options: { align: "center"; behavior: "auto" },
) => void;

function PositionActiveCue({
	index,
	scrollToIndex,
}: {
	index: number;
	scrollToIndex: ScrollToIndex;
}) {
	useMountEffect(() => {
		scrollToIndex(index, {
			align: "center",
			behavior: "auto",
		});
	});
	return null;
}

export function ReadListenActiveCueFollower({
	active,
	layoutRevision,
	scrollToIndex,
}: {
	active: { id: string; index: number } | null;
	layoutRevision: number;
	scrollToIndex: ScrollToIndex;
}) {
	if (!active) return null;

	return (
		<PositionActiveCue
			key={`${active.id}:${layoutRevision}`}
			index={active.index}
			scrollToIndex={scrollToIndex}
		/>
	);
}
