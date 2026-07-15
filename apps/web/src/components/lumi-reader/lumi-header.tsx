import {
	ArrowCounterClockwise,
	ArrowsOut,
	BookmarkSimple,
	List,
	SlidersHorizontal,
	X,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ReaderTheme } from "@/lib/lumi/settings";

interface LumiHeaderProps {
	open: boolean;
	theme: ReaderTheme;
	bookTitle: string;
	hasChapterData: boolean;
	hasBookmark: boolean;
	/** Fills the bookmark icon when sitting on the mark. */
	atBookmark: boolean;
	onTocClick: () => void;
	onSetBookmark: () => void;
	onReturnBookmark: () => void;
	onSettingsClick: () => void;
	onToggleFullscreen: () => void;
	onExit: () => void;
}

function IconButton(props: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={props.label}
			title={props.label}
			onClick={props.onClick}
			className="flex h-9 w-9 items-center justify-center rounded-md opacity-80 transition-opacity hover:opacity-100"
		>
			{props.children}
		</button>
	);
}

/** Reader menu bar: TOC, bookmark, settings, fullscreen, exit. */
export function LumiHeader(props: LumiHeaderProps) {
	const { open, theme } = props;

	return (
		<header
			inert={!open}
			className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-1 px-2 shadow-sm transition-transform duration-300 ease-out"
			style={{
				background: theme.backgroundColor,
				color: theme.fontColor,
				borderBottom: `1px solid color-mix(in oklab, ${theme.fontColor} 12%, transparent)`,
				transform: open ? "translateY(0)" : "translateY(-100%)",
			}}
		>
			<div className="flex items-center gap-1">
				{props.hasChapterData && (
					<IconButton label="Contents" onClick={props.onTocClick}>
						<List size={20} />
					</IconButton>
				)}
				<IconButton label="Set bookmark" onClick={props.onSetBookmark}>
					<BookmarkSimple
						size={20}
						weight={props.atBookmark ? "fill" : "regular"}
					/>
				</IconButton>
				{props.hasBookmark && (
					<IconButton
						label="Return to bookmark"
						onClick={props.onReturnBookmark}
					>
						<ArrowCounterClockwise size={20} />
					</IconButton>
				)}
			</div>

			<div className="min-w-0 flex-1 truncate px-2 text-center text-sm opacity-80">
				{props.bookTitle}
			</div>

			<div className="flex items-center gap-1">
				<IconButton label="Fullscreen" onClick={props.onToggleFullscreen}>
					<ArrowsOut size={20} />
				</IconButton>
				<IconButton label="Settings" onClick={props.onSettingsClick}>
					<SlidersHorizontal size={20} />
				</IconButton>
				<IconButton label="Exit reader" onClick={props.onExit}>
					<X size={20} />
				</IconButton>
			</div>
		</header>
	);
}
