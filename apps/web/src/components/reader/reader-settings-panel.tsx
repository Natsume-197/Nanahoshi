import { X } from "lucide-react";
import { useReaderDispatch, useReaderUI } from "@/context/reader-context";
import { builtInFonts, useReaderSettings } from "@/hooks/use-reader-settings";
import { cn } from "@/lib/utils";

export function ReaderSettingsPanel() {
	const { sideBar } = useReaderUI();
	const dispatch = useReaderDispatch();
	const [settings, setSetting] = useReaderSettings();

	if (sideBar !== "settings") return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-40 bg-black/50"
				onClick={() => dispatch.setSidebar(null)}
				onKeyDown={() => {}}
			/>

			{/* Panel */}
			<div className="fixed top-0 right-0 z-50 h-full w-80 overflow-y-auto border-border border-l bg-background p-6 shadow-lg">
				<div className="mb-6 flex items-center justify-between">
					<h2 className="font-semibold text-lg">Reader Settings</h2>
					<button
						type="button"
						onClick={() => dispatch.setSidebar(null)}
						className="rounded-md p-1 text-muted-foreground hover:text-foreground"
					>
						<X className="size-5" strokeWidth={1.5} />
					</button>
				</div>

				<div className="space-y-6">
					{/* Font Size */}
					<SettingField label="Font Size (px)">
						<input
							type="number"
							min="1"
							value={settings.fontSize}
							onChange={(e) =>
								setSetting("fontSize", Number(e.target.value) || 16)
							}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</SettingField>

					{/* Line Height */}
					<SettingField label="Line Height">
						<input
							type="number"
							min="1"
							step="0.1"
							value={settings.lineHeight}
							onChange={(e) =>
								setSetting("lineHeight", Number(e.target.value) || 1.5)
							}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</SettingField>

					{/* Font Family */}
					<SettingField label="Font Family">
						<select
							value={settings.fontFamily ?? "__default__"}
							onChange={(e) => setSetting("fontFamily", e.target.value)}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						>
							{builtInFonts.map((f) => (
								<option key={f.value} value={f.value}>
									{f.label}
								</option>
							))}
						</select>
					</SettingField>

					{/* Toggle options */}
					<div className="space-y-3">
						<ToggleOption
							label="Vertical Reading"
							checked={settings.vertical}
							onChange={() => setSetting("vertical", !settings.vertical)}
						/>
						<ToggleOption
							label="Simulate Pages"
							checked={settings.paginated}
							onChange={() => setSetting("paginated", !settings.paginated)}
						/>
						<ToggleOption
							label="Show Furigana"
							checked={settings.showFurigana}
							onChange={() =>
								setSetting("showFurigana", !settings.showFurigana)
							}
						/>
						<div>
							<ToggleOption
								label="Disable CSS Injection"
								checked={settings.disableCss}
								onChange={() => setSetting("disableCss", !settings.disableCss)}
							/>
							<p className="mt-1 text-muted-foreground text-xs">
								This might fix rendering issues with some books.
							</p>
						</div>
					</div>

					{/* Padding */}
					<SettingField
						label={`Vertical Padding (${settings.verticalPadding}%)`}
					>
						<input
							type="range"
							min="0"
							max="20"
							value={settings.verticalPadding}
							onChange={(e) =>
								setSetting("verticalPadding", Number(e.target.value))
							}
							className="w-full"
						/>
					</SettingField>

					<SettingField
						label={`Horizontal Padding (${settings.horizontalPadding}%)`}
					>
						<input
							type="range"
							min="0"
							max="20"
							value={settings.horizontalPadding}
							onChange={(e) =>
								setSetting("horizontalPadding", Number(e.target.value))
							}
							className="w-full"
						/>
					</SettingField>

					<button
						type="button"
						onClick={() => dispatch.applySettings()}
						className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
					>
						Apply Settings
					</button>
				</div>

				<p className="mt-8 text-center text-muted-foreground text-xs">
					Powered by{" "}
					<a
						href="https://github.com/xyaman/lumi-reader"
						target="_blank"
						rel="noopener noreferrer"
						className="underline hover:text-foreground"
					>
						Lumi Reader
					</a>
				</p>
			</div>
		</>
	);
}

function SettingField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<label className="block font-medium text-sm">{label}</label>
			{children}
		</div>
	);
}

function ToggleOption({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: () => void;
}) {
	return (
		<label className="flex cursor-pointer items-center gap-2">
			<input
				type="checkbox"
				checked={checked}
				onChange={onChange}
				className={cn(
					"size-4 rounded border-border",
					checked && "accent-primary",
				)}
			/>
			<span className="text-sm">{label}</span>
		</label>
	);
}
