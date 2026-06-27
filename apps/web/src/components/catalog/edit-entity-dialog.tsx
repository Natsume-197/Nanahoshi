import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
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
 * Shared edit modal for catalog entities (series/publisher/author). The inner
 * form is keyed by the entity + open state so it resets to the latest values on
 * each open without a useEffect (codebase convention).
 */
export function EditEntityDialog(props: Props) {
	return (
		<EditEntityModal key={`${props.initialName}:${props.open}`} {...props} />
	);
}

function EditEntityModal({
	open,
	onOpenChange,
	title,
	initialName,
	initialDescription,
	isPending,
	onSubmit,
}: Props) {
	const hasDescription = initialDescription !== undefined;
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription ?? "");

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
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			className="sm:max-w-md"
			onSubmit={handleSubmit}
			footer={
				<>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={isPending || !name.trim()}>
						Save
					</Button>
				</>
			}
		>
			<div className="space-y-4">
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
			</div>
		</Modal>
	);
}
