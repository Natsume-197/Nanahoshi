import { CircleNotch } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

export type CreatedServer = {
	id: string;
	name: string;
	slug: string;
};

type FieldErrors = {
	name?: string;
	slug?: string;
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

export function CreateServerDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated?: (server: CreatedServer) => Promise<void> | void;
}) {
	const nameId = useId();
	const slugId = useId();
	const nameRef = useRef<HTMLInputElement>(null);
	const slugRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [errors, setErrors] = useState<FieldErrors>({});

	const createMutation = useMutation({
		...orpc.admin.createServer.mutationOptions(),
		onSuccess: async (server) => {
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.listServers.queryOptions().queryKey,
			});
			await onCreated?.(server);
			onOpenChange(false);
			setName("");
			setSlug("");
			setSlugTouched(false);
			setErrors({});
			toast.success(m["server.created"]({ name: server.name }));
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["server.create_failed"]())),
	});

	const handleNameChange = (value: string) => {
		setName(value);
		if (value.trim()) setErrors((current) => ({ ...current, name: undefined }));
		if (!slugTouched) setSlug(slugify(value));
	};
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) setErrors({});
		onOpenChange(nextOpen);
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextErrors: FieldErrors = {};
		if (!name.trim()) nextErrors.name = m["setup.err_name_required"]();
		if (!slug.trim()) nextErrors.slug = m["setup.err_slug_required"]();
		setErrors(nextErrors);

		if (nextErrors.name) {
			nameRef.current?.focus();
			return;
		}
		if (nextErrors.slug) {
			slugRef.current?.focus();
			return;
		}

		createMutation.mutate({ name: name.trim(), slug: slug.trim() });
	};

	return (
		<Modal
			open={open}
			onOpenChange={handleOpenChange}
			title={m["server.create"]()}
			description={m["server.create_desc"]()}
			className="sm:max-w-md"
			onSubmit={handleSubmit}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						disabled={createMutation.isPending}
						onClick={() => handleOpenChange(false)}
					>
						{m["common.cancel"]()}
					</Button>
					<Button
						type="submit"
						disabled={createMutation.isPending}
						aria-busy={createMutation.isPending}
					>
						{createMutation.isPending && (
							<CircleNotch
								data-icon="inline-start"
								className="animate-spin motion-reduce:animate-none"
							/>
						)}
						{m["server.create"]()}
					</Button>
				</>
			}
		>
			<FieldGroup>
				<Field data-invalid={Boolean(errors.name)}>
					<FieldLabel htmlFor={nameId}>{m["setup.server_name"]()}</FieldLabel>
					<Input
						ref={nameRef}
						id={nameId}
						autoComplete="off"
						placeholder={m["setup.server_name_placeholder"]()}
						value={name}
						onChange={(event) => handleNameChange(event.target.value)}
						aria-invalid={errors.name ? true : undefined}
						aria-describedby={errors.name ? `${nameId}-error` : undefined}
					/>
					<FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
				</Field>

				<Field data-invalid={Boolean(errors.slug)}>
					<FieldLabel htmlFor={slugId}>{m["setup.slug"]()}</FieldLabel>
					<Input
						ref={slugRef}
						id={slugId}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={m["setup.slug_placeholder"]()}
						value={slug}
						onChange={(event) => {
							setSlugTouched(true);
							setSlug(slugify(event.target.value));
							if (event.target.value.trim()) {
								setErrors((current) => ({ ...current, slug: undefined }));
							}
						}}
						aria-invalid={errors.slug ? true : undefined}
						aria-describedby={
							errors.slug ? `${slugId}-hint ${slugId}-error` : `${slugId}-hint`
						}
					/>
					<FieldDescription id={`${slugId}-hint`}>
						{m["setup.slug_hint"]()}
					</FieldDescription>
					<FieldError id={`${slugId}-error`}>{errors.slug}</FieldError>
				</Field>
			</FieldGroup>
		</Modal>
	);
}
