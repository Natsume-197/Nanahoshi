import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	.email("Enter a valid email address")
	.refine(
		(email) => {
			const domain = email.split("@")[1]?.toLowerCase();
			return domain != null && KINDLE_DOMAINS.has(domain);
		},
		{ message: "Must be a Kindle address (e.g. name@kindle.com)" },
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
			toast.success("Book queued for delivery to your Kindle");
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to send book to Kindle",
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Send to Kindle</DialogTitle>
					<DialogDescription>
						Enter your Kindle email address (e.g. name@kindle.com). The book
						will be sent as an attachment.
					</DialogDescription>
				</DialogHeader>

				<p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs leading-relaxed dark:text-amber-400">
					Make sure your sender email is approved in your{" "}
					<a
						href="https://www.amazon.com/sendtokindle/email"
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
					>
						Amazon Send to Kindle settings
					</a>
					, otherwise the delivery will fail.
				</p>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="kindleEmail">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="kindle-email">Kindle email</Label>
								<Input
									id="kindle-email"
									type="email"
									placeholder="you@kindle.com"
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

					<DialogFooter>
						<Button
							type="submit"
							disabled={sendMutation.isPending}
							className="gap-1.5"
						>
							{sendMutation.isPending ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<Send className="size-3.5" />
							)}
							Send
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
