/**
 * Port of ttu's book-reader-image-gallery (BSD-3-Clause, ッツ Reader Authors):
 * thumbnail list on the left, large preview with prev/next on desktop.
 */

import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useWindowEvent } from "@/hooks/use-window-event";
import type { ReaderTheme } from "@/lib/reader/settings";

export interface GalleryPicture {
	url: string;
	unspoilered: boolean;
}

interface ReaderImageGalleryProps {
	theme: ReaderTheme;
	pictures: GalleryPicture[];
	hideSpoilerImage: boolean;
	onClose: () => void;
}

export function ReaderImageGallery({
	theme,
	pictures,
	hideSpoilerImage,
	onClose,
}: ReaderImageGalleryProps) {
	const [items, setItems] = useState(pictures);
	const [selectedIndex, setSelectedIndex] = useState(() =>
		typeof window !== "undefined" &&
		window.matchMedia("(min-width: 1024px)").matches
			? 0
			: -1,
	);

	const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;

	const previousImage = () => {
		setSelectedIndex((index) => (index > 0 ? index - 1 : index));
	};
	const nextImage = () => {
		setSelectedIndex((index) =>
			index !== -1 && index < items.length - 1 ? index + 1 : index,
		);
	};

	const toggleSpoiler = (url: string) => {
		setItems((prev) =>
			prev.map((picture) =>
				picture.url === url
					? { ...picture, unspoilered: !picture.unspoilered }
					: picture,
			),
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

	const spoilerLabel = (url: string) => (
		<button
			type="button"
			title="Show Image"
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-black/60 px-2 py-3 font-bold text-[#dcddde] text-[15px] uppercase hover:bg-black/90 hover:text-white"
			onClick={(event) => {
				event.stopPropagation();
				toggleSpoiler(url);
			}}
		>
			ネタバレ
		</button>
	);

	return (
		<div
			className="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-full w-full"
			style={{ color: theme.fontColor }}
		>
			<div
				className="flex-1 flex-col justify-between overflow-auto lg:max-w-md"
				style={{ backgroundColor: theme.backgroundColor }}
			>
				<div
					className="sticky top-0 z-10 flex justify-between p-2"
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
				<div className="flex flex-col overflow-auto p-2">
					{items.map((picture, index) => {
						const showSpoiler = hideSpoilerImage && !picture.unspoilered;
						return (
							<button
								key={picture.url}
								type="button"
								className={`relative my-4 flex justify-center ${showSpoiler ? "overflow-hidden" : ""}`}
								onClick={() => {
									if (window.matchMedia("(min-width: 1024px)").matches) {
										setSelectedIndex(index);
									}
								}}
							>
								<img
									src={picture.url}
									alt=""
									className={`max-h-96 lg:max-h-64 ${showSpoiler ? "blur-2xl" : ""}`}
								/>
								{showSpoiler && spoilerLabel(picture.url)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="invisible bg-black/[.85] lg:visible lg:flex lg:flex-1 lg:flex-col">
				{selected && (
					<>
						<div className="flex flex-1">
							<button
								type="button"
								title="Previous Image"
								className={`mx-4 text-5xl hover:text-red-500 ${selectedIndex === 0 ? "invisible" : ""}`}
								onClick={previousImage}
							>
								<CaretLeft className="size-10" />
							</button>
							<div
								className={`relative flex flex-1 items-center justify-center ${hideSpoilerImage && !selected.unspoilered ? "overflow-hidden" : ""}`}
							>
								<img
									className={`max-h-[94vh] ${hideSpoilerImage && !selected.unspoilered ? "blur-3xl" : ""}`}
									src={selected.url}
									alt=""
								/>
								{hideSpoilerImage &&
									!selected.unspoilered &&
									spoilerLabel(selected.url)}
							</div>
							<button
								type="button"
								title="Next Image"
								className={`mx-4 text-5xl hover:text-red-500 ${selectedIndex === items.length - 1 ? "invisible" : ""}`}
								onClick={nextImage}
							>
								<CaretRight className="size-10" />
							</button>
						</div>
						<div className="pb-2 text-center text-white">
							{selectedIndex + 1} / {items.length}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
