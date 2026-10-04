import { Button } from "@nanahoshi/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@nanahoshi/ui/components/field";
import { Input } from "@nanahoshi/ui/components/input";
import { Modal } from "@nanahoshi/ui/components/modal";
import { CircleNotch } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SettingRow, SettingRows } from "@/components/settings/setting-rows";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

/** The instance's public name, edited Discord-style through a modal. */
export function InstanceNameRow() {
	const { data: sso, isLoading } = useQuery(
		orpc.setup.ssoStatus.queryOptions(),
	);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const current = sso?.instanceName ?? "";
	const name = draft.trim().replace(/\s+/g, " ");
	const invalid = name.length === 0;

	const updateMutation = useMutation({
		...orpc.instance.updateName.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.setup.ssoStatus.queryOptions().queryKey,
			});
			toast.success(m["settings.system.instance_name_updated"]());
			setEditing(false);
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const close = () => {
		setSubmitAttempted(false);
		setEditing(false);
	};

	return (
		<>
			<SettingRows>
				<SettingRow
					label={m["settings.system.instance_name"]()}
					value={current}
					loading={isLoading}
					onEdit={() => {
						setDraft(current);
						setSubmitAttempted(false);
						setEditing(true);
					}}
					editLabel={m["common.edit"]()}
				/>
			</SettingRows>

			<Modal
				open={editing}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				title={m["settings.system.instance_name_edit"]()}
				onSubmit={(event) => {
					event.preventDefault();
					setSubmitAttempted(true);
					if (invalid) {
						inputRef.current?.focus();
						return;
					}
					if (name === current) {
						close();
						return;
					}
					updateMutation.mutate({ name });
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={close}
							disabled={updateMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={updateMutation.isPending}
							aria-busy={updateMutation.isPending || undefined}
						>
							{updateMutation.isPending && (
								<CircleNotch
									aria-hidden="true"
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<Field data-invalid={submitAttempted && invalid}>
					<FieldLabel htmlFor="instance-name">
						{m["settings.system.instance_name"]()}
					</FieldLabel>
					<Input
						ref={inputRef}
						id="instance-name"
						name="name"
						autoFocus
						autoComplete="off"
						maxLength={60}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						disabled={updateMutation.isPending}
						aria-invalid={(submitAttempted && invalid) || undefined}
						aria-describedby={
							submitAttempted && invalid
								? "instance-name-hint instance-name-error"
								: "instance-name-hint"
						}
					/>
					<FieldDescription id="instance-name-hint">
						{m["settings.system.instance_name_hint"]()}
					</FieldDescription>
					{submitAttempted && invalid && (
						<FieldError id="instance-name-error">
							{m["settings.system.instance_name_required"]()}
						</FieldError>
					)}
				</Field>
			</Modal>
		</>
	);
}
