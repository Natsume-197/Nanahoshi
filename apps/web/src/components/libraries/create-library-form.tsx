import { BookOpen, Headphones, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DirectoryPicker } from "./directory-picker";

type MediaType = "ebook" | "audiobook";

interface CreateLibraryFormProps {
	onSubmit: (data: {
		name: string;
		mediaType: MediaType;
		paths?: string[];
	}) => void;
	onCancel: () => void;
	isPending: boolean;
}

interface PathField {
	id: string;
	value: string;
}

export function CreateLibraryForm({
	onSubmit,
	onCancel,
	isPending,
}: CreateLibraryFormProps) {
	const [name, setName] = useState("");
	const [mediaType, setMediaType] = useState<MediaType>("ebook");
	const [paths, setPaths] = useState<PathField[]>([
		{ id: "path-0", value: "" },
	]);
	const nextPathIdRef = useRef(1);

	const handleAddPath = () => {
		const id = `path-${nextPathIdRef.current}`;
		nextPathIdRef.current += 1;
		setPaths([...paths, { id, value: "" }]);
	};

	const handleRemovePath = (id: string) => {
		setPaths(paths.filter((pathField) => pathField.id !== id));
	};

	const handlePathChange = (id: string, value: string) => {
		setPaths(
			paths.map((pathField) =>
				pathField.id === id ? { ...pathField, value } : pathField,
			),
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const validPaths = paths
			.map((pathField) => pathField.value)
			.filter((path) => path.trim().length > 0);
		onSubmit({
			name: name.trim(),
			mediaType,
			paths: validPaths.length > 0 ? validPaths : undefined,
		});
	};

	return (
		<Card>
			<form onSubmit={handleSubmit}>
				<CardHeader>
					<CardTitle>Create Library</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-1.5">
						<label
							htmlFor="library-name"
							className="text-muted-foreground text-xs"
						>
							Name
						</label>
						<Input
							id="library-name"
							placeholder="My Library"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							autoFocus
						/>
					</div>

					<div className="space-y-1.5">
						<p className="text-muted-foreground text-xs">Media Type</p>
						<div className="grid grid-cols-2 gap-2">
							{(
								[
									{
										value: "ebook",
										label: "Ebooks",
										icon: BookOpen,
										hint: "EPUB, AZW3, PDF",
									},
									{
										value: "audiobook",
										label: "Audiobooks",
										icon: Headphones,
										hint: "M4B, MP3, FLAC",
									},
								] as const
							).map((opt) => (
								<button
									key={opt.value}
									type="button"
									onClick={() => setMediaType(opt.value)}
									className={cn(
										"flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
										mediaType === opt.value
											? "border-primary bg-primary/5 text-foreground"
											: "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
									)}
								>
									<opt.icon className="size-4 shrink-0" />
									<div>
										<p className="font-medium">{opt.label}</p>
										<p className="text-muted-foreground text-xs">{opt.hint}</p>
									</div>
								</button>
							))}
						</div>
					</div>

					<div className="space-y-1.5">
						<p className="text-muted-foreground text-xs">Paths (optional)</p>
						<div className="space-y-2">
							{paths.map((pathField) => (
								<div key={pathField.id} className="flex items-center gap-2">
									<DirectoryPicker
										placeholder={
											mediaType === "audiobook"
												? "/path/to/audiobooks"
												: "/path/to/books"
										}
										value={pathField.value}
										onChange={(value: string) =>
											handlePathChange(pathField.id, value)
										}
									/>

									{paths.length > 1 && (
										<Button
											type="button"
											variant="outline"
											size="icon"
											onClick={() => handleRemovePath(pathField.id)}
										>
											<X className="size-4" />
										</Button>
									)}
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleAddPath}
							>
								<Plus className="mr-1.5 size-4" />
								Add Path
							</Button>
						</div>
					</div>
				</CardContent>
				<CardFooter className="gap-2">
					<Button type="submit" size="sm" disabled={isPending || !name.trim()}>
						{isPending ? "Creating..." : "Create"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onCancel}>
						Cancel
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
