import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useReaderDispatch, useReaderUI } from "@/context/reader-context";
import { builtInFonts, useReaderSettings } from "@/hooks/use-reader-settings";

export function ReaderSettingsPanel() {
	const { sideBar } = useReaderUI();
	const dispatch = useReaderDispatch();
	const [settings, setSetting] = useReaderSettings();

	return (
		<Sheet
			open={sideBar === "settings"}
			onOpenChange={(open) => {
				if (!open) dispatch.setSidebar(null);
			}}
		>
			<SheetContent side="right" showCloseButton={false} className="w-80">
				<SheetHeader className="sr-only">
					<SheetTitle>Reader Settings</SheetTitle>
					<SheetDescription>Configure your reading experience</SheetDescription>
				</SheetHeader>

				<div className="p-6">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="font-semibold text-lg">Reader Settings</h2>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => dispatch.setSidebar(null)}
						>
							<X className="size-5" strokeWidth={1.5} />
						</Button>
					</div>

					<div className="space-y-6">
						{/* Font Size */}
						<div className="space-y-2">
							<Label>Font Size (px)</Label>
							<Input
								type="number"
								min="1"
								value={settings.fontSize}
								onChange={(e) =>
									setSetting("fontSize", Number(e.target.value) || 16)
								}
							/>
						</div>

						{/* Line Height */}
						<div className="space-y-2">
							<Label>Line Height</Label>
							<Input
								type="number"
								min="1"
								step="0.1"
								value={settings.lineHeight}
								onChange={(e) =>
									setSetting("lineHeight", Number(e.target.value) || 1.5)
								}
							/>
						</div>

						{/* Font Family */}
						<div className="space-y-2">
							<Label>Font Family</Label>
							<Select
								value={settings.fontFamily ?? "__default__"}
								onValueChange={(value) => setSetting("fontFamily", value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{builtInFonts.map((f) => (
										<SelectItem key={f.value} value={f.value}>
											{f.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

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
									onChange={() =>
										setSetting("disableCss", !settings.disableCss)
									}
								/>
								<p className="mt-1 text-muted-foreground text-xs">
									This might fix rendering issues with some books.
								</p>
							</div>
						</div>

						{/* Padding */}
						<div className="space-y-2">
							<Label>Vertical Padding ({settings.verticalPadding}%)</Label>
							<Slider
								min={0}
								max={20}
								value={[settings.verticalPadding]}
								onValueChange={([value]) =>
									setSetting("verticalPadding", value)
								}
							/>
						</div>

						<div className="space-y-2">
							<Label>Horizontal Padding ({settings.horizontalPadding}%)</Label>
							<Slider
								min={0}
								max={20}
								value={[settings.horizontalPadding]}
								onValueChange={([value]) =>
									setSetting("horizontalPadding", value)
								}
							/>
						</div>

						<Button className="w-full" onClick={() => dispatch.applySettings()}>
							Apply Settings
						</Button>
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
			</SheetContent>
		</Sheet>
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
		<Label className="cursor-pointer justify-between">
			<span className="text-sm">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</Label>
	);
}
