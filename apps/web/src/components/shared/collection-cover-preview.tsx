import { coverPresets, getCoverPresetUrl } from "@/utils/covers";

const PREVIEW_SLOTS = 5;
const PREVIEW_SLOT_KEYS = Array.from(
	{ length: PREVIEW_SLOTS },
	(_, i) => `slot-${i}`,
);

export function CollectionCoverPreview({ covers }: { covers: string[] }) {
	const filenames = covers
		.map((c) => c.split("/").pop() ?? "")
		.filter(Boolean)
		.slice(0, PREVIEW_SLOTS);

	return (
		<div className="flex gap-0.5">
			{PREVIEW_SLOT_KEYS.map((slotKey, i) => {
				const name = filenames[i];
				return name ? (
					<img
						key={name}
						src={getCoverPresetUrl(name, coverPresets.small)}
						alt=""
						className="w-0 flex-1 rounded-sm object-contain"
						loading="lazy"
					/>
				) : (
					<div
						key={slotKey}
						className="aspect-[2/3] w-0 flex-1 rounded-sm bg-muted/70"
					/>
				);
			})}
		</div>
	);
}
