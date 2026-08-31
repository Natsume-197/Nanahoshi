/**
 * Reader settings panel. Every change commits immediately so the book updates
 * in real time behind the panel.
 */

import {
	ArrowLeft,
	CaretDown,
	CaretRight,
	CaretUp,
	Check,
	Copy,
	Pen,
	PencilSimple,
	Plus,
	Trash,
	X,
} from "@phosphor-icons/react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { ReaderProfile } from "@/features/reader/presentation/profiles";
import type {
	ReadAs,
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/features/reader/presentation/reader-presentation";
import { canUsePageColumns } from "@/features/reader/presentation/reader-presentation";
import {
	type CustomReaderThemes,
	READER_FONT_SIZE_MAX,
	READER_FONT_SIZE_MIN,
	READER_LINE_HEIGHT_MAX,
	READER_LINE_HEIGHT_MIN,
	READER_THEME_PREVIEW_ID,
	type ReaderSettings,
	type ReaderTheme,
	type ReaderThemeColors,
	readerThemes,
} from "@/features/reader/presentation/settings";
import type { VisualReaderSettings } from "@/features/reader/presentation/visual-settings";
import {
	viewportHeight,
	viewportWidth,
} from "@/features/reader/renderers/shared/viewport";
import {
	readerMix,
	Segmented,
	SliderRow,
	Stepper,
	ThemedOption,
	ThemedSelect,
	ThemedTextInput,
	Toggle,
} from "@/features/reader/ui/controls/reader-controls";
import { ReaderCustomThemeDialog } from "@/features/reader/ui/controls/reader-custom-theme";
import { m } from "@/paraglide/messages";

interface ReaderQuickSettingsProps {
	open: boolean;
	presentation: ReaderPresentation;
	visualSettings: VisualReaderSettings;
	settings: ReaderSettings;
	theme: ReaderTheme;
	customThemes: CustomReaderThemes;
	profiles: ReaderProfile[];
	activeProfileId: string;
	isMobile: boolean;
	readListenActive: boolean;
	onProfileSwitch: (id: string) => void;
	onProfileCreate: (name: string) => void;
	onProfileRename: (id: string, name: string) => void;
	onProfileDuplicate: (id: string) => void;
	onProfileDelete: (id: string) => void;
	onCustomThemeSave: (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => void;
	onCustomThemeDelete: (name: string) => void;
	onCustomThemePreview: (colors: ReaderThemeColors) => void;
	onCustomThemePreviewCancel: (previousTheme: string) => void;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onVisualSettingsChange: (patch: Partial<VisualReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onClose: () => void;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

type QuickSettingsCategory = "visual" | "text" | "layout" | "behaviour";

const DESKTOP_DIALOG_INSET = 16;
const DESKTOP_DIALOG_KEYBOARD_STEP = 8;
const DESKTOP_DIALOG_HEADER_HEIGHT = 44;
const DESKTOP_DIALOG_MIN_WIDTH = 320;
const DESKTOP_DIALOG_MIN_HEIGHT = 320;

interface DialogOffset {
	x: number;
	y: number;
}

interface DialogDragState {
	pointerId: number;
	startX: number;
	startY: number;
	startOffset: DialogOffset;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

interface DialogSize {
	width: number;
	height: number;
}

interface DialogResizeState {
	pointerId: number;
	startX: number;
	startY: number;
	startOffset: DialogOffset;
	startSize: DialogSize;
	maxWidth: number;
	maxHeight: number;
}

type DialogBounds = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

export function constrainQuickSettingsDialogOffset(
	next: DialogOffset,
	current: DialogOffset,
	bounds: DialogBounds,
	viewport: { width: number; height: number },
): DialogOffset {
	const baseLeft = bounds.left - current.x;
	const baseRight = bounds.right - current.x;
	const baseTop = bounds.top - current.y;
	const baseBottom = bounds.bottom - current.y;
	const minX = DESKTOP_DIALOG_INSET - baseLeft;
	const maxX = viewport.width - DESKTOP_DIALOG_INSET - baseRight;
	const minY = DESKTOP_DIALOG_INSET - baseTop;
	const maxY = viewport.height - DESKTOP_DIALOG_INSET - baseBottom;

	return {
		x: Math.min(Math.max(next.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
		y: Math.min(Math.max(next.y, Math.min(minY, maxY)), Math.max(minY, maxY)),
	};
}

interface CustomThemeDialogState {
	selectedTheme: string;
	previousTheme: string;
}

function QuickSettingsSection({
	title,
	showTitle = true,
	children,
}: {
	title: string;
	showTitle?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-5 py-6 first:pt-3">
			{showTitle && (
				<h2 className="font-semibold text-base tracking-tight">{title}</h2>
			)}
			<div className="flex min-w-0 flex-col gap-4">{children}</div>
		</section>
	);
}

function QuickSettingsRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3">
			<span className="min-w-0 flex-1 font-medium text-sm">{label}</span>
			<div className="ml-auto min-w-0 max-w-full shrink [&>*]:max-w-full">
				{children}
			</div>
		</div>
	);
}

export function ReaderQuickSettings({
	open,
	presentation,
	visualSettings,
	settings,
	theme,
	customThemes,
	profiles,
	activeProfileId,
	isMobile,
	readListenActive,
	onProfileSwitch,
	onProfileCreate,
	onProfileRename,
	onProfileDuplicate,
	onProfileDelete,
	onCustomThemeSave,
	onCustomThemeDelete,
	onCustomThemePreview,
	onCustomThemePreviewCancel,
	onChange,
	onVisualSettingsChange,
	onPresentationChange,
	onClose,
}: ReaderQuickSettingsProps) {
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isVisual = presentation.resolvedAs === "visual";
	const isPdf = presentation.renderer === "pdf";
	const resolvedReadAs = isVisual
		? m["reader_settings.visual_content"]()
		: m["reader_settings.category_text"]();
	const canSelectPageColumns = canUsePageColumns(
		presentation.renderer,
		verticalMode,
	);
	const [selectedCategory, setSelectedCategory] =
		useState<QuickSettingsCategory | null>(null);
	const [profileRename, setProfileRename] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [profilePendingDelete, setProfilePendingDelete] = useState<
		string | null
	>(null);
	const [creatingProfile, setCreatingProfile] = useState(false);
	const [newProfileName, setNewProfileName] = useState("");
	const [customThemeDialog, setCustomThemeDialog] =
		useState<CustomThemeDialogState | null>(null);
	const desktopDialogOffsetRef = useRef<DialogOffset>({
		x: 0,
		y: 0,
	});
	const desktopDialogSurfaceRef = useRef<HTMLElement>(null);
	const desktopDialogDragRef = useRef<DialogDragState | null>(null);
	const desktopDialogResizeRef = useRef<DialogResizeState | null>(null);
	const desktopDialogSizeRef = useRef<DialogSize | null>(null);
	const desktopDialogExpandedSizeRef = useRef<DialogSize | null>(null);
	const [desktopDialogCollapsed, setDesktopDialogCollapsed] = useState(false);
	const applyDesktopDialogOffset = useCallback((next: DialogOffset) => {
		desktopDialogOffsetRef.current = next;
		if (desktopDialogSurfaceRef.current) {
			desktopDialogSurfaceRef.current.style.transform = `translate3d(calc(-50% + ${next.x}px), calc(-50% + ${next.y}px), 0)`;
		}
	}, []);

	const applyDesktopDialogGeometry = useCallback(
		(nextOffset: DialogOffset, nextSize: DialogSize) => {
			desktopDialogSizeRef.current = nextSize;
			const surface = desktopDialogSurfaceRef.current;
			if (surface) {
				surface.style.width = `${nextSize.width}px`;
				surface.style.height = `${nextSize.height}px`;
			}
			applyDesktopDialogOffset(nextOffset);
		},
		[applyDesktopDialogOffset],
	);

	useEffect(() => {
		if (!open) {
			setSelectedCategory(null);
			setProfileRename(null);
			setProfilePendingDelete(null);
			setCreatingProfile(false);
			setNewProfileName("");
			applyDesktopDialogOffset({ x: 0, y: 0 });
			desktopDialogDragRef.current = null;
			desktopDialogResizeRef.current = null;
			desktopDialogSizeRef.current = null;
			desktopDialogExpandedSizeRef.current = null;
			setDesktopDialogCollapsed(false);
			if (customThemeDialog) {
				onCustomThemePreviewCancel(customThemeDialog.previousTheme);
				setCustomThemeDialog(null);
			}
		}
	}, [
		applyDesktopDialogOffset,
		customThemeDialog,
		onCustomThemePreviewCancel,
		open,
	]);

	useEffect(() => {
		if (!open || isMobile) return;
		const keepDialogInViewport = () => {
			const surface = desktopDialogSurfaceRef.current;
			if (!surface) return;
			const current = desktopDialogOffsetRef.current;
			applyDesktopDialogOffset(
				constrainQuickSettingsDialogOffset(
					current,
					current,
					surface.getBoundingClientRect(),
					{ width: viewportWidth(), height: viewportHeight() },
				),
			);
		};
		window.addEventListener("resize", keepDialogInViewport);
		return () => window.removeEventListener("resize", keepDialogInViewport);
	}, [applyDesktopDialogOffset, isMobile, open]);

	useEffect(() => {
		if (!open || isMobile || customThemeDialog) return;
		const closeOnEscape = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", closeOnEscape);
		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [customThemeDialog, isMobile, onClose, open]);

	const beginDesktopDialogDrag = (event: PointerEvent<HTMLButtonElement>) => {
		if (!event.isPrimary || event.button !== 0) return;
		const surface = desktopDialogSurfaceRef.current;
		if (!surface) return;
		const desktopDialogOffset = desktopDialogOffsetRef.current;
		const bounds = surface.getBoundingClientRect();
		const baseLeft = bounds.left - desktopDialogOffset.x;
		const baseRight = bounds.right - desktopDialogOffset.x;
		const baseTop = bounds.top - desktopDialogOffset.y;
		const baseBottom = bounds.bottom - desktopDialogOffset.y;
		event.currentTarget.setPointerCapture(event.pointerId);
		desktopDialogDragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startOffset: desktopDialogOffset,
			minX: DESKTOP_DIALOG_INSET - baseLeft,
			maxX: viewportWidth() - DESKTOP_DIALOG_INSET - baseRight,
			minY: DESKTOP_DIALOG_INSET - baseTop,
			maxY: viewportHeight() - DESKTOP_DIALOG_INSET - baseBottom,
		};
	};

	const moveDesktopDialog = (event: PointerEvent<HTMLButtonElement>) => {
		const drag = desktopDialogDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.preventDefault();
		applyDesktopDialogOffset({
			x: Math.min(
				Math.max(drag.startOffset.x + event.clientX - drag.startX, drag.minX),
				drag.maxX,
			),
			y: Math.min(
				Math.max(drag.startOffset.y + event.clientY - drag.startY, drag.minY),
				drag.maxY,
			),
		});
	};

	const endDesktopDialogDrag = (event: PointerEvent<HTMLButtonElement>) => {
		if (desktopDialogDragRef.current?.pointerId !== event.pointerId) return;
		desktopDialogDragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const moveDesktopDialogWithKeyboard = (
		event: KeyboardEvent<HTMLButtonElement>,
	) => {
		const direction = {
			ArrowDown: { x: 0, y: 1 },
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
		}[event.key];
		if (event.key === "Home") {
			event.preventDefault();
			applyDesktopDialogOffset({ x: 0, y: 0 });
			return;
		}
		if (!direction) return;
		event.preventDefault();
		const surface = desktopDialogSurfaceRef.current;
		if (!surface) return;
		const step = event.shiftKey
			? DESKTOP_DIALOG_KEYBOARD_STEP * 4
			: DESKTOP_DIALOG_KEYBOARD_STEP;
		const current = desktopDialogOffsetRef.current;
		applyDesktopDialogOffset(
			constrainQuickSettingsDialogOffset(
				{
					x: current.x + direction.x * step,
					y: current.y + direction.y * step,
				},
				current,
				surface.getBoundingClientRect(),
				{ width: viewportWidth(), height: viewportHeight() },
			),
		);
	};

	const toggleDesktopDialogCollapsed = () => {
		const surface = desktopDialogSurfaceRef.current;
		if (!surface) return;
		const bounds = surface.getBoundingClientRect();
		const currentSize = {
			width: bounds.width,
			height: bounds.height,
		};
		const currentOffset = desktopDialogOffsetRef.current;

		if (!desktopDialogCollapsed) {
			desktopDialogExpandedSizeRef.current = currentSize;
			applyDesktopDialogGeometry(
				{
					x: currentOffset.x,
					y:
						currentOffset.y +
						(DESKTOP_DIALOG_HEADER_HEIGHT - currentSize.height) / 2,
				},
				{ width: currentSize.width, height: DESKTOP_DIALOG_HEADER_HEIGHT },
			);
			setDesktopDialogCollapsed(true);
			return;
		}

		const expandedSize = desktopDialogExpandedSizeRef.current ?? currentSize;
		const nextSize = {
			width: Math.min(
				expandedSize.width,
				viewportWidth() - 2 * DESKTOP_DIALOG_INSET,
			),
			height: Math.min(
				expandedSize.height,
				viewportHeight() - DESKTOP_DIALOG_INSET - bounds.top,
			),
		};
		applyDesktopDialogGeometry(
			{
				x: currentOffset.x + (nextSize.width - currentSize.width) / 2,
				y: currentOffset.y + (nextSize.height - currentSize.height) / 2,
			},
			nextSize,
		);
		setDesktopDialogCollapsed(false);
	};

	const beginDesktopDialogResize = (event: PointerEvent<HTMLButtonElement>) => {
		if (desktopDialogCollapsed || !event.isPrimary || event.button !== 0)
			return;
		const surface = desktopDialogSurfaceRef.current;
		if (!surface) return;
		const bounds = surface.getBoundingClientRect();
		event.currentTarget.setPointerCapture(event.pointerId);
		desktopDialogResizeRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startOffset: desktopDialogOffsetRef.current,
			startSize: { width: bounds.width, height: bounds.height },
			maxWidth: viewportWidth() - DESKTOP_DIALOG_INSET - bounds.left,
			maxHeight: viewportHeight() - DESKTOP_DIALOG_INSET - bounds.top,
		};
	};

	const resizeDesktopDialog = (event: PointerEvent<HTMLButtonElement>) => {
		const resize = desktopDialogResizeRef.current;
		if (!resize || resize.pointerId !== event.pointerId) return;
		event.preventDefault();
		const nextSize = {
			width: Math.min(
				Math.max(
					resize.startSize.width + event.clientX - resize.startX,
					DESKTOP_DIALOG_MIN_WIDTH,
				),
				Math.max(DESKTOP_DIALOG_MIN_WIDTH, resize.maxWidth),
			),
			height: Math.min(
				Math.max(
					resize.startSize.height + event.clientY - resize.startY,
					DESKTOP_DIALOG_MIN_HEIGHT,
				),
				Math.max(DESKTOP_DIALOG_MIN_HEIGHT, resize.maxHeight),
			),
		};
		desktopDialogExpandedSizeRef.current = nextSize;
		applyDesktopDialogGeometry(
			{
				x: resize.startOffset.x + (nextSize.width - resize.startSize.width) / 2,
				y:
					resize.startOffset.y +
					(nextSize.height - resize.startSize.height) / 2,
			},
			nextSize,
		);
	};

	const endDesktopDialogResize = (event: PointerEvent<HTMLButtonElement>) => {
		if (desktopDialogResizeRef.current?.pointerId !== event.pointerId) return;
		desktopDialogResizeRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const resizeDesktopDialogWithKeyboard = (
		event: KeyboardEvent<HTMLButtonElement>,
	) => {
		const direction = {
			ArrowDown: { width: 0, height: 1 },
			ArrowLeft: { width: -1, height: 0 },
			ArrowRight: { width: 1, height: 0 },
			ArrowUp: { width: 0, height: -1 },
		}[event.key];
		if (!direction || desktopDialogCollapsed) return;
		event.preventDefault();
		const surface = desktopDialogSurfaceRef.current;
		if (!surface) return;
		const bounds = surface.getBoundingClientRect();
		const step = event.shiftKey
			? DESKTOP_DIALOG_KEYBOARD_STEP * 4
			: DESKTOP_DIALOG_KEYBOARD_STEP;
		const currentSize = { width: bounds.width, height: bounds.height };
		const nextSize = {
			width: Math.min(
				Math.max(
					currentSize.width + direction.width * step,
					DESKTOP_DIALOG_MIN_WIDTH,
				),
				Math.max(
					DESKTOP_DIALOG_MIN_WIDTH,
					currentSize.width +
						viewportWidth() -
						DESKTOP_DIALOG_INSET -
						bounds.right,
				),
			),
			height: Math.min(
				Math.max(
					currentSize.height + direction.height * step,
					DESKTOP_DIALOG_MIN_HEIGHT,
				),
				Math.max(
					DESKTOP_DIALOG_MIN_HEIGHT,
					currentSize.height +
						viewportHeight() -
						DESKTOP_DIALOG_INSET -
						bounds.bottom,
				),
			),
		};
		const currentOffset = desktopDialogOffsetRef.current;
		desktopDialogExpandedSizeRef.current = nextSize;
		applyDesktopDialogGeometry(
			{
				x: currentOffset.x + (nextSize.width - currentSize.width) / 2,
				y: currentOffset.y + (nextSize.height - currentSize.height) / 2,
			},
			nextSize,
		);
	};

	const commitProfileRename = () => {
		if (!profileRename?.name.trim()) return;
		onProfileRename(profileRename.id, profileRename.name.trim());
		setProfileRename(null);
	};

	const createProfileFromInput = () => {
		if (!newProfileName.trim()) return;
		onProfileCreate(newProfileName.trim());
		setNewProfileName("");
		setCreatingProfile(false);
	};

	const themeIds = [
		...readerThemes.map((readerTheme) => readerTheme.id),
		...Object.keys(customThemes).filter((id) => id !== READER_THEME_PREVIEW_ID),
	];

	const handleCustomThemeSave = (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => {
		onCustomThemeSave(name, colors, previousName);
		setCustomThemeDialog(null);
	};

	const handleCustomThemePreview = (colors: ReaderThemeColors) => {
		onCustomThemePreview(colors);
	};

	const handleCustomThemeDialogClose = () => {
		if (!customThemeDialog) return;
		onCustomThemePreviewCancel(customThemeDialog.previousTheme);
		setCustomThemeDialog(null);
	};

	const handleCustomThemeDelete = (name: string) => {
		onCustomThemeDelete(name);
	};

	const activeCategory = selectedCategory;
	const settingsCategories = [
		{ id: "visual" as const, label: m["reader_settings.category_visual"]() },
		...(!isVisual && !isPdf
			? [{ id: "text" as const, label: m["reader_settings.category_text"]() }]
			: []),
		...(!isPdf
			? [
					{
						id: "layout" as const,
						label: m["reader_settings.category_layout"](),
					},
					{
						id: "behaviour" as const,
						label: m["reader_settings.category_behaviour"](),
					},
				]
			: []),
	];
	const settingsCategoryTitle =
		settingsCategories.find((category) => category.id === selectedCategory)
			?.label ?? m["reader_settings.title"]();

	const horizontalPaddingPct = settings.horizontalPaddingPct;
	const verticalPaddingPct = settings.verticalPaddingPct;
	const updatePadding = (
		axis: "horizontal" | "vertical",
		nextValue: number,
	) => {
		const paddingPct = clampPct(nextValue, 0, 30);
		onChange(
			axis === "horizontal"
				? { horizontalPaddingPct: paddingPct }
				: { verticalPaddingPct: paddingPct },
		);
	};
	const availableThemes = [
		...readerThemes.map(({ id, backgroundColor, fontColor }) => ({
			id,
			backgroundColor,
			fontColor,
		})),
		...Object.entries(customThemes).map(([id, colors]) => ({
			id,
			backgroundColor: colors.backgroundColor,
			fontColor: colors.fontColor,
		})),
	];
	const themeLabels: Record<string, string> = {
		"nanahoshi-theme": "Nanahoshi",
		"light-theme": m["reader_settings.theme_light"](),
		"ecru-theme": m["reader_settings.theme_sepia"](),
		"dark-theme": m["reader_settings.theme_dark"](),
		"attribute-theme": m["reader_settings.theme_contrast"](),
		"black-theme": m["reader_settings.theme_black"](),
	};
	const readerThemeStyle = {
		"--primary": theme.fontColor,
		"--primary-foreground": theme.backgroundColor,
		"--ring": theme.fontColor,
		"--dropdown": theme.backgroundColor,
		"--popover-foreground": theme.fontColor,
		"--accent": mix(10),
		"--accent-foreground": theme.fontColor,
		"--dropdown-destructive": theme.fontColor,
	} as CSSProperties;
	const activeProfile =
		profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
	const pendingDeleteProfile = profiles.find(
		(profile) => profile.id === profilePendingDelete,
	);
	const compactProfileButtonClass =
		"flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 font-medium text-sm outline-none transition-[background-color,opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 sm:h-8 sm:text-xs";

	const closeProfileEditor = () => {
		setCreatingProfile(false);
		setProfileRename(null);
		setProfilePendingDelete(null);
		setNewProfileName("");
	};

	const profileEditorOpen = creatingProfile || profileRename !== null;
	const profileEditorTitle = profileRename
		? m["reader_settings.rename_profile_title"]()
		: m["reader_settings.new_profile_title"]();

	const profileManager = (
		<section
			aria-labelledby="reader-profiles-heading"
			className="flex min-w-0 flex-col gap-2 py-2"
		>
			<div className="px-0.5">
				<h2
					id="reader-profiles-heading"
					className="font-semibold text-xs uppercase tracking-wider opacity-60"
				>
					{m["reader_settings.profile_heading"]()}
				</h2>
			</div>
			<div className="flex min-w-0 flex-wrap gap-2">
				<label htmlFor="reader-profile-select" className="sr-only">
					{m["reader_settings.active_profile_label"]()}
				</label>
				<div className="min-w-40 flex-1">
					<ThemedSelect
						id="reader-profile-select"
						theme={theme}
						value={activeProfileId}
						onChange={(id) => {
							onProfileSwitch(id);
							closeProfileEditor();
						}}
					>
						{profiles.map((profile) => (
							<ThemedOption key={profile.id} theme={theme} value={profile.id}>
								{profile.name}
							</ThemedOption>
						))}
					</ThemedSelect>
				</div>
				<Popover
					open={profileEditorOpen}
					onOpenChange={(open) => {
						if (!open) {
							closeProfileEditor();
							return;
						}
						if (!profileRename) {
							setCreatingProfile(true);
							setProfilePendingDelete(null);
						}
					}}
				>
					<PopoverTrigger asChild>
						<button
							type="button"
							className={compactProfileButtonClass}
							style={{ backgroundColor: mix(8) }}
						>
							<Plus aria-hidden="true" className="size-4" weight="bold" />
							{m["reader_settings.add_profile"]()}
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={6}
						positionerClassName="z-[70]"
						className="w-72 gap-3 rounded-2xl p-3"
						style={{
							...readerThemeStyle,
							backgroundColor: theme.backgroundColor,
							color: theme.fontColor,
						}}
					>
						<PopoverHeader>
							<PopoverTitle className="text-sm">
								{profileEditorTitle}
							</PopoverTitle>
							{creatingProfile && (
								<PopoverDescription className="text-xs opacity-55">
									{m["reader_settings.profile_copy_description"]()}
								</PopoverDescription>
							)}
						</PopoverHeader>
						<form
							className="flex flex-col gap-3"
							onSubmit={(event) => {
								event.preventDefault();
								if (profileRename) commitProfileRename();
								else createProfileFromInput();
							}}
						>
							<label
								htmlFor="reader-profile-name"
								className="flex flex-col gap-1.5 font-medium text-xs"
							>
								{m["reader_settings.profile_name"]()}
								<ThemedTextInput
									id="reader-profile-name"
									ariaLabel={m["reader_settings.profile_name"]()}
									theme={theme}
									value={profileRename?.name ?? newProfileName}
									placeholder={m["reader_settings.profile_name_example"]()}
									onChange={(name) => {
										if (profileRename) {
											setProfileRename({ id: profileRename.id, name });
										} else {
											setNewProfileName(name);
										}
									}}
									onKeyDown={(key) => {
										if (key === "Escape") closeProfileEditor();
									}}
								/>
							</label>
							<div className="flex justify-end gap-2">
								<button
									type="button"
									className={compactProfileButtonClass}
									onClick={closeProfileEditor}
								>
									{m["common.cancel"]()}
								</button>
								<button
									type="submit"
									disabled={
										profileRename
											? !profileRename.name.trim()
											: !newProfileName.trim()
									}
									className={compactProfileButtonClass}
									style={{ backgroundColor: mix(12) }}
								>
									{profileRename ? m["common.save"]() : m["common.create"]()}
								</button>
							</div>
						</form>
					</PopoverContent>
				</Popover>
				{activeProfile && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={compactProfileButtonClass}
								style={{ backgroundColor: mix(8) }}
								onClick={() => {
									setCreatingProfile(false);
									setProfileRename(null);
									setProfilePendingDelete(null);
								}}
							>
								<PencilSimple aria-hidden="true" className="size-4" />
								{m["reader_settings.manage_profile"]()}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							sideOffset={6}
							positionerClassName="z-[70]"
							className="w-44"
							style={readerThemeStyle}
						>
							<DropdownMenuGroup>
								<DropdownMenuLabel className="truncate">
									{activeProfile.name}
								</DropdownMenuLabel>
								<DropdownMenuItem
									onClick={() => {
										setCreatingProfile(false);
										setProfileRename({
											id: activeProfile.id,
											name: activeProfile.name,
										});
									}}
								>
									<Pen aria-hidden="true" />
									{m["common.rename"]()}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => onProfileDuplicate(activeProfile.id)}
								>
									<Copy aria-hidden="true" />
									{m["reader_settings.duplicate_profile"]()}
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									disabled={profiles.length <= 1}
									onClick={() => setProfilePendingDelete(activeProfile.id)}
								>
									<Trash aria-hidden="true" />
									{m["common.delete"]()}
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<Modal
				open={profilePendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) setProfilePendingDelete(null);
				}}
				title={m["reader_settings.delete_profile_title"]({
					name: pendingDeleteProfile?.name ?? "",
				})}
				description={m["reader_settings.delete_profile_description"]()}
				showCloseButton={false}
				layerClassName="z-[70]"
				className="gap-4 sm:max-w-sm"
				style={{
					...readerThemeStyle,
					backgroundColor: theme.backgroundColor,
					color: theme.fontColor,
				}}
				footer={
					<>
						<button
							type="button"
							className={compactProfileButtonClass}
							onClick={() => setProfilePendingDelete(null)}
						>
							{m["common.cancel"]()}
						</button>
						<button
							type="button"
							className={compactProfileButtonClass}
							style={{ backgroundColor: mix(14) }}
							onClick={() => {
								if (profilePendingDelete) {
									onProfileDelete(profilePendingDelete);
								}
								closeProfileEditor();
							}}
						>
							{m["reader_settings.delete_profile_action"]()}
						</button>
					</>
				}
			/>
		</section>
	);
	const settingsContent = (
		<>
			{(!activeCategory || activeCategory === "visual") && (
				<QuickSettingsSection
					title={m["reader_settings.category_visual"]()}
					showTitle={activeCategory === null}
				>
					<fieldset aria-label={m["reader_settings.reading_theme"]()}>
						<legend className="mb-3 font-semibold text-sm">
							{m["reader_settings.themes"]()}
						</legend>
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{availableThemes.map((option) => {
								const selected = option.id === settings.theme;
								return (
									<button
										key={option.id}
										type="button"
										aria-pressed={selected}
										className="group relative min-w-0 cursor-pointer rounded-xl p-1 text-left outline-none transition-[scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
										style={{
											boxShadow: selected
												? `0 0 0 2px ${theme.fontColor}`
												: undefined,
										}}
										onClick={() => onChange({ theme: option.id })}
									>
										<span
											aria-hidden="true"
											className="relative flex h-16 flex-col justify-between rounded-lg p-2 shadow-sm"
											style={{
												backgroundColor: option.backgroundColor,
												boxShadow: `inset 0 0 0 1px ${mix(12)}`,
											}}
										>
											<span
												className="font-serif text-lg leading-none"
												style={{ color: option.fontColor }}
											>
												Aa
											</span>
											<span
												className="w-3/5 text-[8px] leading-tight opacity-75"
												style={{ color: option.fontColor }}
											>
												Aa Aa
											</span>
											{selected && (
												<Check
													className="absolute top-2 right-2 size-4"
													weight="bold"
													style={{ color: option.fontColor }}
												/>
											)}
										</span>
										<span
											className="mt-1 block truncate px-1 font-medium text-[11px]"
											style={{ color: selected ? theme.fontColor : mix(68) }}
										>
											{themeLabels[option.id] ?? option.id}
										</span>
									</button>
								);
							})}
							<button
								type="button"
								className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl p-2 text-sm outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
								style={{ backgroundColor: mix(6), color: mix(72) }}
								onClick={() =>
									setCustomThemeDialog({
										selectedTheme: "",
										previousTheme: settings.theme,
									})
								}
							>
								<Plus aria-hidden="true" className="size-5" weight="bold" />
								<span className="font-medium text-[11px]">
									{m["reader_settings.create_theme"]()}
								</span>
							</button>
						</div>
					</fieldset>
					{customThemes[settings.theme] && (
						<div className="flex items-center justify-between gap-3 rounded-xl px-1 py-1">
							<div className="min-w-0 text-sm">
								<div className="font-medium">{settings.theme}</div>
								<div className="text-xs opacity-55">
									{m["reader_settings.custom_theme"]()}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<button
									type="button"
									aria-label={m["reader_settings.edit_custom_theme"]({
										name: settings.theme,
									})}
									title={m["reader_settings.edit_custom_theme_title"]()}
									className="flex size-10 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() =>
										setCustomThemeDialog({
											selectedTheme: settings.theme,
											previousTheme: settings.theme,
										})
									}
								>
									<PencilSimple aria-hidden="true" className="size-4" />
								</button>
								<button
									type="button"
									aria-label={m["reader_settings.delete_custom_theme"]({
										name: settings.theme,
									})}
									title={m["reader_settings.delete_custom_theme_title"]()}
									className="flex size-10 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() => handleCustomThemeDelete(settings.theme)}
								>
									<Trash aria-hidden="true" className="size-4" />
								</button>
							</div>
						</div>
					)}
					{!isPdf && (
						<>
							<QuickSettingsRow
								label={m["reader_settings.character_counter"]()}
							>
								<Toggle
									theme={theme}
									value={settings.showCharacterCounter}
									onChange={(showCharacterCounter) =>
										onChange({ showCharacterCounter })
									}
								/>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.percentage"]()}>
								<Toggle
									theme={theme}
									value={settings.showPercentage}
									onChange={(showPercentage) => onChange({ showPercentage })}
								/>
							</QuickSettingsRow>
						</>
					)}
					{isVisual && (
						<QuickSettingsRow label={m["reader_settings.progress_indicator"]()}>
							<div className="w-52 max-w-full">
								<Segmented
									theme={theme}
									ariaLabel={m["reader_settings.progress_indicator"]()}
									options={[
										{ id: "text", text: m["reader_settings.page_number"]() },
										{
											id: "page-lines",
											text: m["reader_settings.page_ticks"](),
										},
										{ id: "bar", text: m["reader_settings.progress_bar"]() },
									]}
									selected={visualSettings.progressStyle}
									onSelect={(progressStyle) =>
										onVisualSettingsChange({ progressStyle })
									}
								/>
							</div>
						</QuickSettingsRow>
					)}
				</QuickSettingsSection>
			)}

			{!isVisual &&
				!isPdf &&
				(!activeCategory || activeCategory === "text") && (
					<>
						{!activeCategory && (
							<Separator style={{ backgroundColor: mix(14) }} />
						)}
						<QuickSettingsSection
							title={m["reader_settings.category_text"]()}
							showTitle={activeCategory === null}
						>
							<QuickSettingsRow label={m["reader_settings.text_size"]()}>
								<fieldset aria-label={m["reader_settings.text_size"]()}>
									<Stepper
										theme={theme}
										compact
										display={`${settings.fontSize}`}
										canDecrease={settings.fontSize > READER_FONT_SIZE_MIN}
										canIncrease={settings.fontSize < READER_FONT_SIZE_MAX}
										onStep={(direction) =>
											onChange({
												fontSize: Math.min(
													READER_FONT_SIZE_MAX,
													Math.max(
														READER_FONT_SIZE_MIN,
														settings.fontSize + direction,
													),
												),
											})
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.font"]()}>
								<div className="w-40">
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.font"]()}
										options={[
											{
												id: "Noto Serif JP",
												text: m["reader_settings.serif"](),
											},
											{ id: "Noto Sans JP", text: m["reader_settings.sans"]() },
										]}
										selected={settings.fontFamilyGroupOne}
										onSelect={(fontFamilyGroupOne) =>
											onChange({ fontFamilyGroupOne })
										}
									/>
								</div>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.sans_font_family"]()}>
								<ThemedTextInput
									ariaLabel={m["reader_settings.sans_font_family"]()}
									theme={theme}
									value={settings.fontFamilyGroupTwo}
									list="reader-quick-sans-fonts"
									onChange={(value) =>
										onChange({
											fontFamilyGroupTwo: value || "Noto Sans JP",
										})
									}
								/>
							</QuickSettingsRow>
							<datalist id="reader-quick-sans-fonts">
								<option value="Noto Sans JP" />
								<option value="sans-serif" />
							</datalist>
							<QuickSettingsRow label={m["reader_settings.font_weight"]()}>
								<div className="w-40">
									<ThemedSelect
										theme={theme}
										value={
											settings.fontWeight === null
												? "default"
												: String(settings.fontWeight)
										}
										onChange={(value) =>
											onChange({
												fontWeight:
													value === "default"
														? null
														: Number.parseInt(value, 10),
											})
										}
									>
										<ThemedOption theme={theme} value="default">
											{m["reader_settings.default_option"]()}
										</ThemedOption>
										{[300, 400, 500, 600, 700].map((weight) => (
											<ThemedOption
												key={weight}
												theme={theme}
												value={String(weight)}
											>
												{weight}
											</ThemedOption>
										))}
									</ThemedSelect>
								</div>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.text_orientation"]()}>
								<div className="w-40">
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.text_orientation"]()}
										options={[
											{
												id: "horizontal-tb",
												text: m["reader_settings.horizontal"](),
											},
											{
												id: "vertical-rl",
												text: m["reader_settings.vertical"](),
											},
										]}
										selected={settings.writingMode}
										onSelect={(writingMode) => onChange({ writingMode })}
									/>
								</div>
							</QuickSettingsRow>
							{verticalMode && (
								<>
									<QuickSettingsRow
										label={m["reader_settings.latin_character_orientation"]()}
									>
										<div className="w-40">
											<Segmented
												theme={theme}
												ariaLabel={m[
													"reader_settings.latin_character_orientation"
												]()}
												options={[
													{ id: "mixed", text: m["reader_settings.mixed"]() },
													{
														id: "upright",
														text: m["reader_settings.upright"](),
													},
												]}
												selected={settings.verticalTextOrientation}
												onSelect={(verticalTextOrientation) =>
													onChange({ verticalTextOrientation })
												}
											/>
										</div>
									</QuickSettingsRow>
									<QuickSettingsRow label={m["reader_settings.font_kerning"]()}>
										<Toggle
											theme={theme}
											value={settings.enableFontKerning}
											onChange={(enableFontKerning) =>
												onChange({ enableFontKerning })
											}
										/>
									</QuickSettingsRow>
									<QuickSettingsRow
										label={m["reader_settings.proportional_vertical_metrics"]()}
									>
										<Toggle
											theme={theme}
											value={settings.enableFontVPAL}
											onChange={(enableFontVPAL) =>
												onChange({ enableFontVPAL })
											}
										/>
									</QuickSettingsRow>
								</>
							)}
							<QuickSettingsRow label={m["reader_settings.justify_text"]()}>
								<Toggle
									theme={theme}
									value={settings.enableTextJustification}
									onChange={(enableTextJustification) =>
										onChange({ enableTextJustification })
									}
								/>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.pretty_text_wrap"]()}>
								<Toggle
									theme={theme}
									value={settings.enableTextWrapPretty}
									onChange={(enableTextWrapPretty) =>
										onChange({ enableTextWrapPretty })
									}
								/>
							</QuickSettingsRow>
							<QuickSettingsRow
								label={m["reader_settings.prioritize_reader_styles"]()}
							>
								<Toggle
									theme={theme}
									value={settings.prioritizeReaderStyles}
									onChange={(prioritizeReaderStyles) =>
										onChange({ prioritizeReaderStyles })
									}
								/>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.hide_furigana"]()}>
								<Toggle
									theme={theme}
									value={settings.hideFurigana}
									onChange={(hideFurigana) => onChange({ hideFurigana })}
								/>
							</QuickSettingsRow>
							{settings.hideFurigana && (
								<QuickSettingsRow label={m["reader_settings.hide_style"]()}>
									<div className="w-52 max-w-full">
										<Segmented
											theme={theme}
											ariaLabel={m["reader_settings.furigana_hide_style"]()}
											options={[
												{
													id: "Hide",
													text: m["reader_settings.hide_option"](),
												},
												{ id: "Partial", text: m["reader_settings.partial"]() },
												{ id: "Toggle", text: m["reader_settings.toggle"]() },
												{ id: "Full", text: m["reader_settings.full"]() },
											]}
											selected={settings.furiganaStyle}
											onSelect={(furiganaStyle) => onChange({ furiganaStyle })}
										/>
									</div>
								</QuickSettingsRow>
							)}
							<QuickSettingsRow
								label={m["reader_settings.paragraph_indentation"]()}
							>
								<fieldset
									className="w-48 max-w-full"
									aria-label={m["reader_settings.paragraph_indentation"]()}
								>
									<SliderRow
										theme={theme}
										min={0}
										max={10}
										step={0.5}
										value={settings.textIndentation}
										format={(textIndentation) => `${textIndentation}em`}
										onChange={(textIndentation) =>
											onChange({ textIndentation })
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow
								label={m["reader_settings.paragraph_spacing"]()}
							>
								<div className="w-40">
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.paragraph_spacing"]()}
										options={[
											{ id: "auto", text: m["reader_settings.auto"]() },
											{ id: "manual", text: m["reader_settings.manual"]() },
										]}
										selected={settings.textMarginMode}
										onSelect={(textMarginMode) => onChange({ textMarginMode })}
									/>
								</div>
							</QuickSettingsRow>
							{settings.textMarginMode === "manual" && (
								<QuickSettingsRow
									label={m["reader_settings.paragraph_spacing_size"]()}
								>
									<fieldset
										className="w-48 max-w-full"
										aria-label={m["reader_settings.paragraph_spacing_size"]()}
									>
										<SliderRow
											theme={theme}
											min={0}
											max={10}
											step={0.5}
											value={settings.textMarginValue}
											format={(textMarginValue) => `${textMarginValue}em`}
											onChange={(textMarginValue) =>
												onChange({ textMarginValue })
											}
										/>
									</fieldset>
								</QuickSettingsRow>
							)}
						</QuickSettingsSection>
					</>
				)}

			{!activeCategory && <Separator style={{ backgroundColor: mix(14) }} />}
			{!isPdf && (!activeCategory || activeCategory === "layout") && (
				<QuickSettingsSection
					title={m["reader_settings.category_layout"]()}
					showTitle={activeCategory === null}
				>
					{presentation.supportsVisual && (
						<>
							<QuickSettingsRow label={m["reader_settings.read_as"]()}>
								<div className="w-64 max-w-full">
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.read_as"]()}
										options={[
											{ id: "auto", text: m["reader_settings.automatic"]() },
											{
												id: "text",
												text: m["reader_settings.category_text"](),
											},
											{
												id: "visual",
												text: m["reader_settings.visual_content"](),
											},
										]}
										selected={presentation.readAs}
										onSelect={(value: ReadAs) =>
											onPresentationChange({ type: "read-as", value })
										}
									/>
								</div>
							</QuickSettingsRow>
							{presentation.readAs === "auto" && (
								<p className="-mt-2 text-xs opacity-55">
									{m["reader_settings.automatic_uses"]({
										mode: resolvedReadAs,
									})}
								</p>
							)}
						</>
					)}
					{isVisual ? (
						<>
							<label
								htmlFor="reader-quick-page-layout"
								className="flex flex-col gap-2"
							>
								<div className="font-medium text-sm">
									{m["reader_settings.page_layout"]()}
								</div>
								<ThemedSelect
									id="reader-quick-page-layout"
									theme={theme}
									value={presentation.visualLayout}
									onChange={(layout) =>
										onVisualSettingsChange({
											layout: layout as VisualReaderSettings["layout"],
										})
									}
								>
									<ThemedOption theme={theme} value="horizontal-strip">
										{m["reader_settings.horizontal_strip"]()}
									</ThemedOption>
									<ThemedOption theme={theme} value="single-page">
										{m["reader_settings.single_page"]()}
									</ThemedOption>
									<ThemedOption theme={theme} value="two-page-spread">
										{m["reader_settings.two_page_spread"]()}
									</ThemedOption>
									<ThemedOption theme={theme} value="vertical-strip">
										{m["reader_settings.vertical_strip"]()}
									</ThemedOption>
								</ThemedSelect>
							</label>
							{presentation.visualLayout !== "vertical-strip" && (
								<div className="flex flex-col gap-2">
									<div className="font-medium text-sm">
										{m["reader_settings.reading_direction"]()}
									</div>
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.reading_direction"]()}
										options={[
											{ id: "auto", text: m["reader_settings.auto"]() },
											{
												id: "rtl",
												text: m["reader_settings.visual_direction"](),
											},
											{
												id: "ltr",
												text: m["reader_settings.western_direction"](),
											},
										]}
										selected={visualSettings.readingDirection}
										onSelect={(readingDirection) =>
											onVisualSettingsChange({ readingDirection })
										}
									/>
								</div>
							)}
						</>
					) : (
						<>
							<QuickSettingsRow label={m["reader_settings.flow"]()}>
								<div className="w-52 max-w-full">
									<Segmented
										theme={theme}
										ariaLabel={m["reader_settings.reading_flow"]()}
										options={[
											{ id: "scroll", text: m["reader_settings.continuous"]() },
											{ id: "paginated", text: m["reader_settings.pages"]() },
											{ id: "focus", text: m["reader_settings.focus"]() },
										]}
										selected={presentation.textLayout}
										onSelect={(value) =>
											onPresentationChange({ type: "text-layout", value })
										}
									/>
								</div>
							</QuickSettingsRow>
							{presentation.textLayout === "focus" && (
								<>
									<QuickSettingsRow label={m["reader_settings.text_speed"]()}>
										<div className="w-64 max-w-full">
											<Segmented
												theme={theme}
												ariaLabel={m["reader_settings.text_speed"]()}
												options={[
													{
														id: "instant",
														text: m["reader_settings.speed_instant"](),
													},
													{
														id: "slow",
														text: m["reader_settings.speed_slow"](),
													},
													{
														id: "normal",
														text: m["reader_settings.speed_normal"](),
													},
													{
														id: "fast",
														text: m["reader_settings.speed_fast"](),
													},
												]}
												selected={settings.focusTextSpeed}
												onSelect={(focusTextSpeed) =>
													onChange({ focusTextSpeed })
												}
											/>
										</div>
									</QuickSettingsRow>
									<QuickSettingsRow
										label={m["reader_settings.sentence_marker"]()}
									>
										<Toggle
											theme={theme}
											value={settings.focusSentenceIndicator}
											onChange={(focusSentenceIndicator) =>
												onChange({ focusSentenceIndicator })
											}
										/>
									</QuickSettingsRow>
									{readListenActive && (
										<QuickSettingsRow
											label={m["reader_settings.line_by_line_audio"]()}
										>
											<Toggle
												theme={theme}
												value={settings.focusPauseAudioAfterLine}
												onChange={(focusPauseAudioAfterLine) =>
													onChange({ focusPauseAudioAfterLine })
												}
											/>
										</QuickSettingsRow>
									)}
								</>
							)}
							{canSelectPageColumns && (
								<QuickSettingsRow label={m["reader_settings.columns"]()}>
									<div className="w-40">
										<Segmented
											theme={theme}
											ariaLabel={m["reader_settings.columns"]()}
											options={[
												{ id: 0, text: m["reader_settings.auto"]() },
												{ id: 1, text: "1" },
												{ id: 2, text: "2" },
											]}
											selected={Math.min(settings.pageColumns, 2)}
											onSelect={(pageColumns) => onChange({ pageColumns })}
										/>
									</div>
								</QuickSettingsRow>
							)}
							{presentation.renderer === "text-paginated" && (
								<QuickSettingsRow
									label={m["reader_settings.avoid_page_break"]()}
								>
									<Toggle
										theme={theme}
										value={settings.avoidPageBreak}
										onChange={(avoidPageBreak) => onChange({ avoidPageBreak })}
									/>
								</QuickSettingsRow>
							)}
							<QuickSettingsRow label={m["reader_settings.line_height"]()}>
								<fieldset aria-label={m["reader_settings.line_height"]()}>
									<Stepper
										theme={theme}
										compact
										display={settings.lineHeight.toFixed(2)}
										canDecrease={settings.lineHeight > READER_LINE_HEIGHT_MIN}
										canIncrease={settings.lineHeight < READER_LINE_HEIGHT_MAX}
										onStep={(direction) =>
											onChange({
												lineHeight: Math.min(
													READER_LINE_HEIGHT_MAX,
													Math.max(
														READER_LINE_HEIGHT_MIN,
														Math.round(
															(settings.lineHeight + direction * 0.05) * 100,
														) / 100,
													),
												),
											})
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow
								label={m["reader_settings.horizontal_padding"]()}
							>
								<fieldset
									aria-label={m["reader_settings.horizontal_padding"]()}
								>
									<Stepper
										theme={theme}
										compact
										display={`${horizontalPaddingPct}%`}
										canDecrease={horizontalPaddingPct > 0}
										canIncrease={horizontalPaddingPct < 30}
										onStep={(direction) =>
											updatePadding(
												"horizontal",
												horizontalPaddingPct + direction,
											)
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow label={m["reader_settings.vertical_padding"]()}>
								<fieldset aria-label={m["reader_settings.vertical_padding"]()}>
									<Stepper
										theme={theme}
										compact
										display={`${verticalPaddingPct}%`}
										canDecrease={verticalPaddingPct > 0}
										canIncrease={verticalPaddingPct < 30}
										onStep={(direction) =>
											updatePadding("vertical", verticalPaddingPct + direction)
										}
									/>
								</fieldset>
							</QuickSettingsRow>
						</>
					)}
				</QuickSettingsSection>
			)}

			{!activeCategory && <Separator style={{ backgroundColor: mix(14) }} />}
			{!isPdf && (!activeCategory || activeCategory === "behaviour") && (
				<QuickSettingsSection
					title={m["reader_settings.category_behaviour"]()}
					showTitle={activeCategory === null}
				>
					{presentation.renderer === "text-scroll" && (
						<QuickSettingsRow
							label={m["reader_settings.keep_position_on_resize"]()}
						>
							<Toggle
								theme={theme}
								ariaLabel={m["reader_settings.keep_position_on_resize"]()}
								value={settings.autoPositionOnResize}
								onChange={(autoPositionOnResize) =>
									onChange({ autoPositionOnResize })
								}
							/>
						</QuickSettingsRow>
					)}
					{!isVisual && (
						<QuickSettingsRow
							label={m["reader_settings.disable_wheel_navigation"]()}
						>
							<Toggle
								theme={theme}
								value={settings.disableWheelNavigation}
								onChange={(disableWheelNavigation) =>
									onChange({ disableWheelNavigation })
								}
							/>
						</QuickSettingsRow>
					)}
				</QuickSettingsSection>
			)}

			{customThemeDialog !== null && (
				<ReaderCustomThemeDialog
					theme={theme}
					selectedTheme={customThemeDialog.selectedTheme}
					existingThemes={themeIds}
					customThemes={customThemes}
					onSave={handleCustomThemeSave}
					onPreview={handleCustomThemePreview}
					onClose={handleCustomThemeDialogClose}
				/>
			)}
		</>
	);

	const categoryList = (
		<div className="flex min-w-0 flex-col gap-5">
			{profileManager}
			<Separator style={{ backgroundColor: mix(14) }} />
			<section
				aria-labelledby="reader-settings-categories"
				className="flex flex-col gap-2"
			>
				<h2
					id="reader-settings-categories"
					className="px-1 font-semibold text-xs uppercase tracking-wider opacity-55"
				>
					{m["reader_settings.settings_heading"]()}
				</h2>
				{settingsCategories.map((category) => {
					return (
						<button
							key={category.id}
							type="button"
							className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-start outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] sm:min-h-10"
							style={{ backgroundColor: mix(5) }}
							onClick={() => setSelectedCategory(category.id)}
						>
							<span className="min-w-0 flex-1 font-medium text-sm">
								{category.label}
							</span>
							<CaretRight
								aria-hidden="true"
								className="size-4 shrink-0 opacity-55"
							/>
						</button>
					);
				})}
			</section>
		</div>
	);

	if (isMobile) {
		return (
			<Drawer
				open={open}
				modal={false}
				onOpenChange={(open) => !open && onClose()}
				showSwipeHandle
			>
				<DrawerContent
					className="reader-quick-settings-sheet writing-horizontal-tb rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 [--drawer-inset:0px] [&_[data-slot=drawer-swipe-handle]:after]:bg-current [&_[data-slot=drawer-swipe-handle]:after]:opacity-30"
					style={
						{
							...readerThemeStyle,
							"--drawer-content-height": "60dvh",
							"--drawer-content-max-height": "60dvh",
							color: theme.fontColor,
							backgroundColor: theme.backgroundColor,
							borderColor: mix(20),
						} as CSSProperties
					}
				>
					<DrawerHeader className="px-[max(1rem,var(--safe-area-left))] pt-2 pr-[max(1rem,var(--safe-area-right))] pb-3 text-start">
						<div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
							{selectedCategory ? (
								<button
									type="button"
									aria-label={m["reader_settings.back_to_categories"]()}
									title={m["reader_settings.back"]()}
									className="flex size-11 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() => setSelectedCategory(null)}
								>
									<ArrowLeft aria-hidden="true" className="size-5" />
								</button>
							) : (
								<span aria-hidden="true" />
							)}
							<DrawerTitle
								id="reader-quick-settings-title"
								className="truncate text-center text-base"
								style={{ color: theme.fontColor }}
							>
								{settingsCategoryTitle}
							</DrawerTitle>
							<span aria-hidden="true" />
						</div>
						<DrawerDescription className="sr-only">
							{m["reader_settings.drawer_description"]()}
						</DrawerDescription>
					</DrawerHeader>
					<div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-[max(1rem,var(--safe-area-left))] pt-1 pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))]">
						{selectedCategory === null ? categoryList : settingsContent}
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<aside
			ref={desktopDialogSurfaceRef}
			hidden={!open}
			role="dialog"
			aria-labelledby="reader-quick-settings-window-title"
			aria-describedby="reader-quick-settings-window-description"
			data-collapsed={desktopDialogCollapsed || undefined}
			data-reader-overlay
			className="reader-quick-settings-dialog writing-horizontal-tb fixed top-1/2 left-1/2 z-[60] flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
			style={{
				...readerThemeStyle,
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
				borderColor: mix(20),
				width: desktopDialogSizeRef.current
					? `${desktopDialogSizeRef.current.width}px`
					: "min(36rem, calc(100vw - 2rem))",
				height: desktopDialogSizeRef.current
					? `${desktopDialogSizeRef.current.height}px`
					: "min(42rem, calc(100dvh - 2rem))",
				maxWidth: "calc(100vw - 2rem)",
				maxHeight: desktopDialogCollapsed
					? `${DESKTOP_DIALOG_HEADER_HEIGHT}px`
					: "calc(100dvh - 2rem)",
				transform: `translate3d(calc(-50% + ${desktopDialogOffsetRef.current.x}px), calc(-50% + ${desktopDialogOffsetRef.current.y}px), 0)`,
				willChange: "transform",
			}}
		>
			<header
				className="grid h-11 shrink-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b px-2"
				style={{ borderBottomColor: mix(20) }}
			>
				{selectedCategory ? (
					<button
						type="button"
						aria-label={m["reader_settings.back_to_categories"]()}
						title={m["reader_settings.back"]()}
						className="flex size-8 cursor-pointer items-center justify-center rounded-md outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						style={{ backgroundColor: mix(7) }}
						onClick={() => setSelectedCategory(null)}
					>
						<ArrowLeft aria-hidden="true" className="size-4" />
					</button>
				) : (
					<span aria-hidden="true" />
				)}
				<button
					type="button"
					aria-label={m["reader_settings.move_window"]()}
					title={m["reader_settings.drag_to_move"]()}
					className="flex h-9 min-w-0 touch-none select-none items-center justify-center rounded-md px-2 text-center outline-none transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:cursor-grabbing"
					style={{ cursor: "grab" }}
					onKeyDown={moveDesktopDialogWithKeyboard}
					onPointerDown={beginDesktopDialogDrag}
					onPointerMove={moveDesktopDialog}
					onPointerUp={endDesktopDialogDrag}
					onPointerCancel={endDesktopDialogDrag}
				>
					<span
						id="reader-quick-settings-window-title"
						className="truncate font-semibold text-sm tracking-tight"
					>
						{settingsCategoryTitle}
					</span>
				</button>
				<div className="flex items-center justify-self-end">
					<button
						type="button"
						aria-expanded={!desktopDialogCollapsed}
						aria-controls="reader-quick-settings-window-content"
						aria-label={
							desktopDialogCollapsed
								? m["reader_settings.expand_window"]()
								: m["reader_settings.collapse_window"]()
						}
						title={
							desktopDialogCollapsed
								? m["reader_settings.expand"]()
								: m["reader_settings.collapse"]()
						}
						className="flex size-8 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						onClick={toggleDesktopDialogCollapsed}
					>
						{desktopDialogCollapsed ? (
							<CaretDown aria-hidden="true" className="size-3.5" />
						) : (
							<CaretUp aria-hidden="true" className="size-3.5" />
						)}
					</button>
					<button
						type="button"
						aria-label={m["reader_settings.close_settings"]()}
						title={m["common.close"]()}
						className="flex size-8 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						onClick={onClose}
					>
						<X aria-hidden="true" className="size-3.5" />
					</button>
				</div>
			</header>
			<div
				id="reader-quick-settings-window-content"
				hidden={desktopDialogCollapsed}
				className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4"
			>
				{selectedCategory === null ? categoryList : settingsContent}
			</div>
			<button
				hidden={desktopDialogCollapsed}
				type="button"
				aria-label={m["reader_settings.resize_window"]()}
				title={m["reader_settings.drag_to_resize"]()}
				className="absolute right-0 bottom-0 z-10 flex size-7 cursor-nwse-resize touch-none select-none items-center justify-center rounded-tl-md outline-none transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-[-3px] active:opacity-50"
				onKeyDown={resizeDesktopDialogWithKeyboard}
				onPointerDown={beginDesktopDialogResize}
				onPointerMove={resizeDesktopDialog}
				onPointerUp={endDesktopDialogResize}
				onPointerCancel={endDesktopDialogResize}
			>
				<svg
					aria-hidden="true"
					className="size-4 opacity-55"
					fill="none"
					focusable="false"
					viewBox="0 0 16 16"
				>
					<path
						d="M4 13.5 13.5 4"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.5"
					/>
					<path
						d="M9.5 13.5 13.5 9.5"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.5"
					/>
				</svg>
			</button>
			<p id="reader-quick-settings-window-description" className="sr-only">
				{m["reader_settings.window_description"]()}
			</p>
		</aside>
	);
}
