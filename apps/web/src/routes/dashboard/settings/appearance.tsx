import { createFileRoute } from "@tanstack/react-router";
import { Palette, Save, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	applyCustomColors,
	type CustomColors,
	deleteSavedTheme,
	deriveCustomThemeVars,
	getSavedThemes,
	getStoredCustomColors,
	type SavedTheme,
	saveCustomColors,
	saveTheme,
	type Theme,
	useTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/settings/appearance")({
	component: AppearanceSettings,
});

const presetOptions: {
	value: Exclude<Theme, "custom" | `saved:${string}`>;
	label: string;
	description: string;
	preview: { bg: string; sidebar: string; card: string; accent: string };
}[] = [
		{
			value: "dark",
			label: "Nanahoshi",
			description: "Dark with white accents",
			preview: {
				bg: "bg-[#0a0a0a]",
				sidebar: "bg-[#0a0a0a]",
				card: "bg-[#171717]",
				accent: "bg-[#e5e5e5]",
			},
		},
		{
			value: "anilist",
			label: "AniList",
			description: "Dark blue with light blue accents",
			preview: {
				bg: "bg-[#0b1622]",
				sidebar: "bg-[#11161d]",
				card: "bg-[#152232]",
				accent: "bg-[#3db4f2]",
			},
		},
	];

function ThemePreviewMockup({
	bg,
	sidebar,
	card,
	accent,
}: {
	bg: string;
	sidebar: string;
	card: string;
	accent: string;
}) {
	return (
		<div
			className={cn("flex h-20 w-full overflow-hidden rounded-md sm:h-24", bg)}
		>
			<div className={cn("w-1/4 border-white/5 border-r", sidebar)}>
				<div className="space-y-1 p-1.5 pt-2.5">
					<div className={cn("h-1 w-3/4 rounded-full opacity-50", accent)} />
					<div className={cn("h-1 w-1/2 rounded-full opacity-25", accent)} />
					<div className={cn("h-1 w-2/3 rounded-full opacity-25", accent)} />
				</div>
			</div>
			<div className="flex-1 p-2">
				<div className={cn("h-3 w-3/4 rounded-sm opacity-60", card)} />
				<div className="mt-1.5 flex gap-1">
					<div className={cn("h-6 flex-1 rounded-sm", card)} />
					<div className={cn("h-6 flex-1 rounded-sm", card)} />
				</div>
			</div>
		</div>
	);
}

function InlineThemePreview({ colors }: { colors: CustomColors }) {
	const vars = deriveCustomThemeVars(colors);
	return (
		<div
			className="flex h-20 w-full overflow-hidden rounded-md sm:h-24"
			style={{ backgroundColor: vars["--background"] }}
		>
			<div
				className="w-1/4 border-white/5 border-r"
				style={{ backgroundColor: vars["--sidebar"] }}
			>
				<div className="space-y-1 p-1.5 pt-2.5">
					<div
						className="h-1 w-3/4 rounded-full opacity-50"
						style={{ backgroundColor: vars["--primary"] }}
					/>
					<div
						className="h-1 w-1/2 rounded-full opacity-25"
						style={{ backgroundColor: vars["--primary"] }}
					/>
					<div
						className="h-1 w-2/3 rounded-full opacity-25"
						style={{ backgroundColor: vars["--primary"] }}
					/>
				</div>
			</div>
			<div className="flex flex-1 flex-col">
				<div
					className="h-3 shrink-0 border-white/5 border-b"
					style={{ backgroundColor: vars["--header"] }}
				/>
				<div className="flex-1 p-2">
					<div
						className="h-2.5 w-3/4 rounded-sm opacity-60"
						style={{ backgroundColor: vars["--card"] }}
					/>
					<div className="mt-1.5 flex gap-1">
						<div
							className="h-6 flex-1 rounded-sm"
							style={{ backgroundColor: vars["--card"] }}
						/>
						<div
							className="h-6 flex-1 rounded-sm"
							style={{ backgroundColor: vars["--card"] }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function ColorPicker({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const swatchRef = useRef<HTMLDivElement>(null);
	const hexRef = useRef<HTMLParagraphElement>(null);

	const handleInput = useCallback(
		(e: React.FormEvent<HTMLInputElement>) => {
			const v = e.currentTarget.value;
			if (swatchRef.current) swatchRef.current.style.backgroundColor = v;
			if (hexRef.current) hexRef.current.textContent = v;
			onChange(v);
		},
		[onChange],
	);

	return (
		<div className="flex items-center gap-3">
			<label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border">
				<input
					type="color"
					defaultValue={value}
					onInput={handleInput}
					className="absolute inset-0 cursor-pointer opacity-0"
				/>
				<div
					ref={swatchRef}
					className="size-full"
					style={{ backgroundColor: value }}
				/>
			</label>
			<div className="min-w-0 flex-1">
				<Label className="text-sm">{label}</Label>
				<p
					ref={hexRef}
					className="font-mono text-muted-foreground text-xs uppercase"
				>
					{value}
				</p>
			</div>
		</div>
	);
}

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();
	const [customColors, setCustomColors] = useState<CustomColors>(
		getStoredCustomColors,
	);
	const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(getSavedThemes);
	const [saveName, setSaveName] = useState("");
	const [showSaveInput, setShowSaveInput] = useState(false);

	const debounceRef = useRef<ReturnType<typeof setTimeout>>();
	const colorsRef = useRef(customColors);
	const rafScheduled = useRef(false);

	const updateCustomColor = useCallback(
		(key: keyof CustomColors, value: string) => {
			colorsRef.current = { ...colorsRef.current, [key]: value };

			if (theme === "custom" && !rafScheduled.current) {
				rafScheduled.current = true;
				requestAnimationFrame(() => {
					rafScheduled.current = false;
					applyCustomColors(colorsRef.current);
				});
			}

			clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				setCustomColors(colorsRef.current);
				saveCustomColors(colorsRef.current);
			}, 300);
		},
		[theme],
	);

	const selectCustom = useCallback(() => {
		setTheme("custom");
	}, [setTheme]);

	const handleSaveTheme = useCallback(() => {
		const name = saveName.trim();
		if (!name) return;
		const saved = saveTheme(name, colorsRef.current);
		setSavedThemes(getSavedThemes());
		setTheme(`saved:${saved.id}`);
		setSaveName("");
		setShowSaveInput(false);
		toast.success(`Theme "${name}" saved`);
	}, [saveName, setTheme]);

	const handleDeleteSaved = useCallback(
		(id: string, e: React.MouseEvent) => {
			e.stopPropagation();
			deleteSavedTheme(id);
			setSavedThemes(getSavedThemes());
			if (theme === `saved:${id}`) {
				setTheme("dark");
			}
		},
		[theme, setTheme],
	);

	const isCustomLike = theme === "custom" || theme.startsWith("saved:");

	return (
		<div className="space-y-8">
			<section>
				<h2 className="mb-1 font-semibold text-lg">Appearance</h2>
				<p className="mb-6 text-muted-foreground text-sm">
					Customize how the app looks on your device
				</p>

				<div className="space-y-3">
					<p className="font-medium text-sm">Theme</p>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{presetOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setTheme(option.value)}
								className={cn(
									"group flex flex-col items-start gap-2.5 rounded-lg p-2 text-left transition-all",
									theme === option.value
										? "ring-2 ring-primary ring-offset-2 ring-offset-background"
										: "ring-1 ring-border hover:ring-border/80",
								)}
							>
								<ThemePreviewMockup {...option.preview} />
								<div className="px-0.5">
									<p
										className={cn(
											"font-medium text-sm",
											theme === option.value
												? "text-foreground"
												: "text-muted-foreground",
										)}
									>
										{option.label}
									</p>
									<p className="text-muted-foreground text-xs">
										{option.description}
									</p>
								</div>
							</button>
						))}

						{/* Saved themes */}
						{savedThemes.map((saved) => {
							const isActive = theme === `saved:${saved.id}`;
							return (
								<button
									key={saved.id}
									type="button"
									onClick={() => setTheme(`saved:${saved.id}`)}
									className={cn(
										"group relative flex flex-col items-start gap-2.5 rounded-lg p-2 text-left transition-all",
										isActive
											? "ring-2 ring-primary ring-offset-2 ring-offset-background"
											: "ring-1 ring-border hover:ring-border/80",
									)}
								>
									<InlineThemePreview colors={saved.colors} />
									<div className="flex w-full items-center justify-between px-0.5">
										<div>
											<p
												className={cn(
													"font-medium text-sm",
													isActive
														? "text-foreground"
														: "text-muted-foreground",
												)}
											>
												{saved.name}
											</p>
											<p className="text-muted-foreground text-xs">Saved</p>
										</div>
										<button
											type="button"
											className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
											onClick={(e) => handleDeleteSaved(saved.id, e)}
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								</button>
							);
						})}

						{/* Custom theme card */}
						<button
							type="button"
							onClick={selectCustom}
							className={cn(
								"group flex flex-col items-start gap-2.5 rounded-lg p-2 text-left transition-all",
								theme === "custom"
									? "ring-2 ring-primary ring-offset-2 ring-offset-background"
									: "ring-1 ring-border hover:ring-border/80",
							)}
						>
							<InlineThemePreview colors={customColors} />
							<div className="px-0.5">
								<p
									className={cn(
										"flex items-center gap-1.5 font-medium text-sm",
										theme === "custom"
											? "text-foreground"
											: "text-muted-foreground",
									)}
								>
									<Palette className="size-3.5" />
									Custom
								</p>
								<p className="text-muted-foreground text-xs">
									Pick your own colors
								</p>
							</div>
						</button>
					</div>
				</div>

				{/* Custom color pickers */}
				{isCustomLike && (
					<>
						<Separator className="my-6" />
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<p className="font-medium text-sm">
									{theme === "custom" ? "Custom colors" : "Edit colors"}
								</p>
								{!showSaveInput && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setShowSaveInput(true)}
									>
										<Save className="mr-1.5 size-3.5" />
										Save theme
									</Button>
								)}
							</div>

							{showSaveInput && (
								<div className="flex gap-2">
									<Input
										placeholder="Theme name"
										value={saveName}
										onChange={(e) => setSaveName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSaveTheme();
											if (e.key === "Escape") setShowSaveInput(false);
										}}
										className="max-w-48"
										autoFocus
									/>
									<Button
										size="sm"
										onClick={handleSaveTheme}
										disabled={!saveName.trim()}
									>
										Save
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setShowSaveInput(false);
											setSaveName("");
										}}
									>
										Cancel
									</Button>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
								<ColorPicker
									label="Background"
									value={customColors.background}
									onChange={(v) => updateCustomColor("background", v)}
								/>
								<ColorPicker
									label="Accent"
									value={customColors.primary}
									onChange={(v) => updateCustomColor("primary", v)}
								/>
								<ColorPicker
									label="Sidebar"
									value={customColors.sidebar}
									onChange={(v) => updateCustomColor("sidebar", v)}
								/>
								<ColorPicker
									label="Header"
									value={customColors.header}
									onChange={(v) => updateCustomColor("header", v)}
								/>
							</div>
						</div>
					</>
				)}
			</section>
		</div>
	);
}
