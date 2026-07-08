import "react-easy-crop/react-easy-crop.css";
import { Image, CircleNotch, ArrowClockwise } from "@phosphor-icons/react";
import { useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Slider } from "@/components/ui/slider";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { getCroppedBlob } from "@/lib/crop-image";
import { m } from "@/paraglide/messages";

export interface ImageEditorDialogProps {
	/** When non-null the dialog is open and edits this file; null closes it. */
	file: File | null;
	/** Crop overlay shape — round for avatars/logos, rect for banners. */
	shape?: "round" | "rect";
	/** Crop aspect ratio (width / height). */
	aspect: number;
	onCancel: () => void;
	/** Receives the cropped image as a WebP blob when the user applies. */
	onApply: (blob: Blob) => void;
	/** True while the parent is uploading — keeps the Apply button busy. */
	applying?: boolean;
}

export function ImageEditorDialog({
	file,
	shape = "round",
	aspect,
	onCancel,
	onApply,
	applying,
}: ImageEditorDialogProps) {
	return (
		<Modal
			open={!!file}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
			title={m["common.edit_image"]()}
			className="sm:max-w-lg"
		>
			{file && (
				// Remount per file so crop/zoom/rotation start fresh each time.
				<Editor
					key={`${file.name}-${file.lastModified}-${file.size}`}
					file={file}
					shape={shape}
					aspect={aspect}
					onCancel={onCancel}
					onApply={onApply}
					applying={applying}
				/>
			)}
		</Modal>
	);
}

function Editor({
	file,
	shape,
	aspect,
	onCancel,
	onApply,
	applying,
}: {
	file: File;
	shape: "round" | "rect";
	aspect: number;
	onCancel: () => void;
	onApply: (blob: Blob) => void;
	applying?: boolean;
}) {
	// Create and revoke the object URL in the same effect so it survives React
	// StrictMode's dev remount (a split create/cleanup would revoke it early and
	// leave the cropper showing a broken, all-black image).
	const [src, setSrc] = useState<string | null>(null);
	useMountEffect(() => {
		const url = URL.createObjectURL(file);
		setSrc(url);
		return () => URL.revokeObjectURL(url);
	});

	const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [areaPixels, setAreaPixels] = useState<Area | null>(null);
	const [processing, setProcessing] = useState(false);

	const reset = () => {
		setCrop({ x: 0, y: 0 });
		setZoom(1);
		setRotation(0);
	};

	const busy = processing || !!applying;

	const apply = async () => {
		if (!src || !areaPixels) return;
		setProcessing(true);
		try {
			const blob = await getCroppedBlob(src, areaPixels, rotation);
			onApply(blob);
		} finally {
			setProcessing(false);
		}
	};

	return (
		<div className="grid gap-5">
			<div className="relative h-72 w-full overflow-hidden rounded-xl bg-black/85">
				{src ? (
					<Cropper
						image={src}
						crop={crop}
						zoom={zoom}
						rotation={rotation}
						aspect={aspect}
						cropShape={shape}
						showGrid={shape === "rect"}
						restrictPosition={true}
						onCropChange={setCrop}
						onZoomChange={setZoom}
						onRotationChange={setRotation}
						onCropComplete={(_, pixels) => setAreaPixels(pixels)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<CircleNotch className="size-6 animate-spin text-white/70" />
					</div>
				)}
			</div>

			<div className="flex items-center gap-3">
				<Image className="size-4 shrink-0 text-muted-foreground" />
				<Slider
					value={[zoom]}
					min={1}
					max={3}
					step={0.01}
					onValueChange={([v]) => setZoom(v ?? 1)}
					aria-label={m["common.zoom"]()}
				/>
				<Image className="size-5 shrink-0 text-muted-foreground" />
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					className="ml-1 shrink-0"
					onClick={() => setRotation((r) => (r + 90) % 360)}
					aria-label={m["common.rotate"]()}
				>
					<ArrowClockwise className="size-4" />
				</Button>
			</div>

			<div className="flex items-center justify-between">
				<Button
					type="button"
					variant="ghost"
					className="text-muted-foreground"
					onClick={reset}
					disabled={busy}
				>
					{m["common.reset"]()}
				</Button>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={busy}
					>
						{m["common.cancel"]()}
					</Button>
					<Button type="button" onClick={apply} disabled={busy || !areaPixels}>
						{busy && <CircleNotch className="mr-1.5 size-3.5 animate-spin" />}
						{m["common.apply"]()}
					</Button>
				</div>
			</div>
		</div>
	);
}
