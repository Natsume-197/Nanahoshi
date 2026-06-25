import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EditValues = { name: string; description?: string | null };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	initialName: string;
	/** Pass a string (incl. "") to show a description field; omit to hide it. */
	initialDescription?: string | null;
	isPending: boolean;
	onSubmit: (values: EditValues) => void;
};

/**
 * Shared edit dialog for catalog entities (series/publisher/author). The inner
 * form is keyed by the entity + open state so it resets to the latest values on
 * each open without a useEffect (codebase convention).
 */
export function EditEntityDialog(props: Props) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<EditEntityForm key={`${props.initialName}:${props.open}`} {...props} />
			</DialogContent>
		</Dialog>
	);
}

function EditEntityForm({
	title,
	initialName,
	initialDescription,
	isPending,
	onSubmit,
	onOpenChange,
}: Props) {
	const hasDescription = initialDescription !== undefined;
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription ?? "");
	const formId = "edit-entity-form";

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		onSubmit({
			name: trimmed,
			...(hasDescription ? { description: description.trim() || null } : {}),
		});
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
			</DialogHeader>
			<form id={formId} onSubmit={handleSubmit} className="space-y-4 py-2">
				<div className="space-y-1.5">
					<Label htmlFor="edit-entity-name">Name</Label>
					<Input
						id="edit-entity-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
					/>
				</div>
				{hasDescription && (
					<div className="space-y-1.5">
						<Label htmlFor="edit-entity-description">Description</Label>
						<Textarea
							id="edit-entity-description"
							rows={4}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
				)}
			</form>
			<DialogFooter>
				<Button variant="outline" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					form={formId}
					disabled={isPending || !name.trim()}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
}
