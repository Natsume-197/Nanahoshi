import { Plus, X } from "lucide-react";
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

interface CreateLibraryFormProps {
	onSubmit: (data: { name: string; paths?: string[] }) => void;
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
						<p className="text-muted-foreground text-xs">Paths (optional)</p>
						<div className="space-y-2">
							{paths.map((pathField) => (
								<div key={pathField.id} className="flex items-center gap-2">
									<Input
										placeholder="/path/to/books"
										value={pathField.value}
										onChange={(e) =>
											handlePathChange(pathField.id, e.target.value)
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
