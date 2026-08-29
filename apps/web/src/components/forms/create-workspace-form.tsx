import { ArrowLeft } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { Button } from "../ui/button";

type Step = 1 | 2;

type FieldErrors = {
	name?: string;
	slug?: string;
	passwordRepeat?: string;
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

/** Inline, field-associated error — replaces ephemeral toasts so the message
 * stays put and screen readers tie it to the input via aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
	if (!message) return null;
	return (
		<p id={id} role="alert" className="text-destructive text-sm">
			{message}
		</p>
	);
}

export function CreateWorkspaceForm() {
	const [step, setStep] = useState<Step>(1);
	const [workspaceName, setWorkspaceName] = useState("");
	const [workspaceSlug, setWorkspaceSlug] = useState("");
	// Once the user edits the slug by hand, stop deriving it from the name.
	const [slugTouched, setSlugTouched] = useState(false);
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [passwordRepeat, setPasswordRepeat] = useState("");
	const [errors, setErrors] = useState<FieldErrors>({});

	const { mutate, isPending } = useMutation({
		...orpc.setup.complete.mutationOptions(),
		onSuccess: async () => {
			// Sign in with the credentials just created so the admin lands on the
			// dashboard instead of retyping them at /login.
			const { error } = await authClient.signIn.email({ email, password });
			if (error) {
				window.location.replace("/login");
				return;
			}
			toast.success(m["setup.complete"]());
			window.location.replace("/dashboard");
		},
		onError: (error) => {
			toast.error(error.message || m["setup.failed"]());
		},
	});

	const handleNameChange = (value: string) => {
		setWorkspaceName(value);
		if (value.trim()) setErrors((prev) => ({ ...prev, name: undefined }));
		if (!slugTouched) setWorkspaceSlug(slugify(value));
	};

	const goNext = () => {
		const next: FieldErrors = {};
		if (!workspaceName.trim()) next.name = m["setup.err_name_required"]();
		if (!workspaceSlug.trim()) next.slug = m["setup.err_slug_required"]();
		setErrors(next);
		if (next.name || next.slug) return;
		setStep(2);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (password !== passwordRepeat) {
			setErrors((prev) => ({
				...prev,
				passwordRepeat: m["setup.passwords_mismatch"](),
			}));
			return;
		}
		setErrors({});
		mutate({
			workspaceName,
			workspaceSlug,
			username,
			email,
			password,
		});
	};

	return (
		<div className="w-full max-w-xl">
			<div className="space-y-2">
				<h1 className="font-bold text-4xl tracking-tight">
					{m["setup.title"]()}
				</h1>
				<p className="text-muted-foreground leading-relaxed">
					{m["setup.subtitle"]()}
				</p>
			</div>

			<div className="mt-8 space-y-2">
				<div aria-hidden="true" className="flex items-center gap-2">
					<div
						className={cn(
							"h-1 flex-1 rounded-full transition-colors",
							step >= 1 ? "bg-foreground" : "bg-border",
						)}
					/>
					<div
						className={cn(
							"h-1 flex-1 rounded-full transition-colors",
							step >= 2 ? "bg-foreground" : "bg-border",
						)}
					/>
				</div>
				{/* Announces each step transition to assistive tech. */}
				<p className="text-muted-foreground text-sm" aria-live="polite">
					{m["setup.step_indicator"]({ step })} ·{" "}
					{step === 1 ? m["setup.step1"]() : m["setup.step2"]()}
				</p>
			</div>

			<form onSubmit={handleSubmit} className="mt-6 space-y-6">
				{step === 1 ? (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">{m["setup.server_name"]()}</Label>
							<Input
								autoComplete="off"
								id="name"
								className="h-11 border-border bg-input"
								placeholder={m["setup.server_name_placeholder"]()}
								value={workspaceName}
								onChange={(e) => handleNameChange(e.target.value)}
								aria-invalid={errors.name ? true : undefined}
								aria-describedby={errors.name ? "name-error" : undefined}
							/>
							<FieldError id="name-error" message={errors.name} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="slug">{m["setup.slug"]()}</Label>
							<Input
								autoComplete="off"
								id="slug"
								className="h-11 border-border bg-input"
								placeholder={m["setup.slug_placeholder"]()}
								value={workspaceSlug}
								onChange={(e) => {
									setSlugTouched(true);
									setWorkspaceSlug(slugify(e.target.value));
									if (e.target.value.trim())
										setErrors((prev) => ({ ...prev, slug: undefined }));
								}}
								aria-invalid={errors.slug ? true : undefined}
								aria-describedby={
									errors.slug ? "slug-error slug-hint" : "slug-hint"
								}
							/>
							<p id="slug-hint" className="text-muted-foreground text-xs">
								{m["setup.slug_hint"]()}
							</p>
							<FieldError id="slug-error" message={errors.slug} />
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">{m["auth.username"]()}</Label>
							<Input
								id="username"
								autoComplete="username"
								className="h-11 border-border bg-input"
								placeholder={m["setup.username_placeholder"]()}
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">{m["auth.email"]()}</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								className="h-11 border-border bg-input"
								placeholder={m["auth.email_placeholder"]()}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">{m["auth.password"]()}</Label>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								className="h-11 border-border bg-input"
								placeholder={m["auth.password_min_placeholder"]()}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password-repeat">
								{m["setup.repeat_password"]()}
							</Label>
							<Input
								id="password-repeat"
								type="password"
								autoComplete="new-password"
								className="h-11 border-border bg-input"
								placeholder={m["setup.repeat_password_placeholder"]()}
								value={passwordRepeat}
								onChange={(e) => {
									setPasswordRepeat(e.target.value);
									setErrors((prev) => ({ ...prev, passwordRepeat: undefined }));
								}}
								required
								minLength={8}
								aria-invalid={errors.passwordRepeat ? true : undefined}
								aria-describedby={
									errors.passwordRepeat ? "password-repeat-error" : undefined
								}
							/>
							<FieldError
								id="password-repeat-error"
								message={errors.passwordRepeat}
							/>
						</div>
					</div>
				)}

				{step === 1 ? (
					<Button
						type="button"
						onClick={goNext}
						className="h-11 w-full bg-foreground font-semibold text-background hover:bg-foreground/90"
					>
						{m["setup.next"]()}
					</Button>
				) : (
					<div className="flex gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => setStep(1)}
							className="h-11"
						>
							<ArrowLeft />
							{m["setup.back"]()}
						</Button>
						<Button
							type="submit"
							disabled={isPending}
							className="h-11 flex-1 bg-foreground font-semibold text-background hover:bg-foreground/90"
						>
							{isPending
								? m["setup.creating_account"]()
								: m["setup.create_account"]()}
						</Button>
					</div>
				)}
			</form>
		</div>
	);
}
