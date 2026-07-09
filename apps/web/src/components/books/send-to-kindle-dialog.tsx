import { CircleNotch, PaperPlaneTilt } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

const KINDLE_EMAIL_KEY = "kindle-email";
const KINDLE_DOMAINS = new Set([
	"kindle.com",
	"kindle.cn",
	"kindle.co.jp",
	"free.kindle.com",
	"kindle.co.uk",
]);

const kindleEmailSchema = z
	.string()
	.email(m["kindle.err_invalid"]())
	.refine(
		(email) => {
			const domain = email.split("@")[1]?.toLowerCase();
			return domain != null && KINDLE_DOMAINS.has(domain);
		},
		{ message: m["kindle.err_not_kindle"]() },
	);

export function SendToKindleDialog({
	bookUuid,
	open,
	onOpenChange,
}: {
	bookUuid: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const sendMutation = useMutation({
		mutationFn: (kindleEmail: string) =>
			client.kindle.sendToKindle({ bookUuid, kindleEmail }),
		onSuccess: (_data, kindleEmail) => {
			localStorage.setItem(KINDLE_EMAIL_KEY, kindleEmail);
			toast.success(m["toast.kindle_queued"]());
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : m["toast.kindle_failed"](),
			);
		},
	});

	const form = useForm({
		defaultValues: {
			kindleEmail:
				typeof window !== "undefined"
					? (localStorage.getItem(KINDLE_EMAIL_KEY) ?? "")
					: "",
		},
		onSubmit: ({ value }) => {
			sendMutation.mutate(value.kindleEmail);
		},
		validators: {
			onSubmit: z.object({
				kindleEmail: kindleEmailSchema,
			}),
		},
	});

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["kindle.title"]()}
			description={m["kindle.desc"]()}
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
			footer={
				<Button
					type="submit"
					disabled={sendMutation.isPending}
					className="gap-1.5"
				>
					{sendMutation.isPending ? (
						<CircleNotch className="size-3.5 animate-spin" />
					) : (
						<PaperPlaneTilt className="size-3.5" />
					)}
					{m["kindle.send"]()}
				</Button>
			}
		>
			<p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs leading-relaxed dark:text-amber-400">
				{m["kindle.approve_pre"]()}
				<a
					href="https://www.amazon.com/sendtokindle/email"
					target="_blank"
					rel="noopener noreferrer"
					className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
				>
					{m["kindle.approve_link"]()}
				</a>
				{m["kindle.approve_post"]()}
			</p>

			<form.Field name="kindleEmail">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="kindle-email">{m["kindle.email_label"]()}</Label>
						<Input
							id="kindle-email"
							type="email"
							placeholder={m["kindle.email_placeholder"]()}
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
						{field.state.meta.errors?.length > 0 && (
							<p className="text-destructive text-xs">
								{field.state.meta.errors[0]?.message}
							</p>
						)}
					</div>
				)}
			</form.Field>
		</Modal>
	);
}
