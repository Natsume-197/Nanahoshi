import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useState } from "react";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import { useWindowEvent } from "@/hooks/use-window-event";

export interface GalleryPicture {
	url: string;
}

interface ReaderImageGalleryProps {
	theme: ReaderTheme;
	pictures: GalleryPicture[];
	onClose: () => void;
}

export function ReaderImageGallery({
	theme,
	pictures,
	onClose,
}: ReaderImageGalleryProps) {
	const [selectedIndex, setSelectedIndex] = useState(() =>
		typeof window !== "undefined" &&
		window.matchMedia("(min-width: 1024px)").matches
			? 0
			: -1,
	);

	const selected = selectedIndex >= 0 ? pictures[selectedIndex] : undefined;

	const previousImage = () => {
		setSelectedIndex((index) => (index > 0 ? index - 1 : index));
	};
	const nextImage = () => {
		setSelectedIndex((index) =>
			index !== -1 && index < pictures.length - 1 ? index + 1 : index,
		);
	};

	useWindowEvent("keydown", (event) => {
		switch (event.code || event.key) {
			case "Escape":
				event.preventDefault();
				onClose();
				break;
			case "ArrowLeft":
			case "PageUp":
				event.preventDefault();
				previousImage();
				break;
			case "ArrowRight":
			case "PageDown":
				event.preventDefault();
				nextImage();
				break;
			default:
				break;
		}
	});

	return (
		<div
			className="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-dvh w-full"
			style={{ color: theme.fontColor }}
		>
			<div
				className="flex-1 flex-col justify-between overflow-auto lg:max-w-md"
				style={{ backgroundColor: theme.backgroundColor }}
			>
				<div
					className="sticky top-0 z-10 flex justify-between pt-[calc(0.5rem+var(--safe-area-top))] pr-[max(0.5rem,var(--safe-area-right))] pb-2 pl-[max(0.5rem,var(--safe-area-left))]"
					style={{ backgroundColor: theme.backgroundColor }}
				>
					<button
						type="button"
						title="Close Image Gallery"
						className="flex items-end md:items-center"
						onClick={onClose}
					>
						<X className="size-5" />
					</button>
				</div>
				<div className="flex flex-col overflow-auto pt-2 pr-[max(0.5rem,var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[max(0.5rem,var(--safe-area-left))]">
					{pictures.map((picture, index) => (
						<button
							key={picture.url}
							type="button"
							className="my-4 flex justify-center"
							onClick={() => {
								if (window.matchMedia("(min-width: 1024px)").matches) {
									setSelectedIndex(index);
								}
							}}
						>
							<img src={picture.url} alt="" className="max-h-96 lg:max-h-64" />
						</button>
					))}
				</div>
			</div>

			<div className="invisible bg-black/[.85] lg:visible lg:flex lg:flex-1 lg:flex-col">
				{selected && (
					<>
						<div className="flex flex-1">
							<button
								type="button"
								title="Previous Image"
								className={`mx-4 text-5xl hover:text-destructive ${selectedIndex === 0 ? "invisible" : ""}`}
								onClick={previousImage}
							>
								<CaretLeft className="size-10" />
							</button>
							<div className="relative flex flex-1 items-center justify-center">
								<img className="max-h-[94vh]" src={selected.url} alt="" />
							</div>
							<button
								type="button"
								title="Next Image"
								className={`mx-4 text-5xl hover:text-destructive ${selectedIndex === pictures.length - 1 ? "invisible" : ""}`}
								onClick={nextImage}
							>
								<CaretRight className="size-10" />
							</button>
						</div>
						<div className="pb-2 text-center text-white">
							{selectedIndex + 1} / {pictures.length}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
