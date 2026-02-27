import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface CreateLibraryFormProps {
	onSubmit: (data: { name: string; paths?: string[] }) => void;
	onCancel: () => void;
	isPending: boolean;
}

export default function CreateLibraryForm({
	onSubmit,
	onCancel,
	isPending,
}: CreateLibraryFormProps) {
	const [name, setName] = useState("");
	const [paths, setPaths] = useState<string[]>([""]);

	const handleAddPath = () => {
		setPaths([...paths, ""]);
	};

	const handleRemovePath = (index: number) => {
		setPaths(paths.filter((_, i) => i !== index));
	};

	const handlePathChange = (index: number, value: string) => {
		const updated = [...paths];
		updated[index] = value;
		setPaths(updated);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const validPaths = paths.filter((p) => p.trim().length > 0);
		onSubmit({
			name: name.trim(),
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
						<label className="text-muted-foreground text-xs">
							Paths (optional)
						</label>
						<div className="space-y-2">
							{paths.map((path, i) => (
								<div key={i} className="flex items-center gap-2">
									<Input
										placeholder="/path/to/books"
										value={path}
										onChange={(e) => handlePathChange(i, e.target.value)}
									/>
									{paths.length > 1 && (
										<Button
											type="button"
											variant="outline"
											size="icon"
											onClick={() => handleRemovePath(i)}
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
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onCancel}
					>
						Cancel
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
