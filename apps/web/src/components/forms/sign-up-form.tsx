import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { OAuthErrorNotice } from "@/components/forms/oauth-error-notice";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export function SignUpForm({
	onSwitchToSignIn: _onSwitchToSignIn,
	redirectTo,
	oauthError,
}: {
	onSwitchToSignIn: () => void;
	redirectTo?: string;
	oauthError?: string;
}) {
	const navigate = useNavigate({
		from: "/",
	});
	const router = useRouter();
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());
	// Arriving from an invite link (/invite/CODE) carries the code that opens
	// the invite-only sign-up gate on the server — also across the Discord
	// OAuth round-trip (the header lands in a short-lived cookie).
	const inviteCode = redirectTo?.match(/^\/invite\/([^/?#]+)/)?.[1];
	const errorReturnPath = inviteCode ? redirectTo : "/sign-up";
	// Instance registration policy: which sign-up paths are offered at all.
	const registrationClosed = sso?.signup.policy === "closed";
	const emailSignUp = sso ? sso.signup.email : true;
	const discordSignUp = sso?.signup.discord ?? false;

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			name: "",
			username: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: value.name,
					username: value.username.toLowerCase(),
				},
				{
					headers: inviteCode ? { "x-invite-code": inviteCode } : undefined,
					onSuccess: async () => {
						queryClient.removeQueries({ queryKey: ["auth", "session"] });
						await router.invalidate();
						if (redirectTo) navigate({ href: redirectTo });
						else navigate({ to: "/dashboard" });
						toast.success(m["toast.sign_up_success"]());
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, m["auth.err.name_min"]()),
				username: z
					.string()
					.min(3, m["auth.err.username_min"]())
					.max(30, m["auth.err.username_max"]())
					.regex(/^[a-zA-Z0-9_]+$/, m["auth.err.username_chars"]()),
				email: z.email(m["auth.err.email_invalid"]()),
				password: z.string().min(8, m["auth.err.password_min"]()),
			}),
		},
	});

	if (registrationClosed) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
				<div className="w-full max-w-md">
					<div className="space-y-2">
						<h1 className="font-bold text-4xl tracking-tight">
							{m["auth.create_account"]()}
						</h1>
						<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
							{m["auth.signup_closed_note"]()}
						</p>
					</div>
					<p className="mt-6 text-muted-foreground text-sm">
						{m["auth.have_account"]()}{" "}
						<Link
							to="/login"
							search={{ redirect: redirectTo }}
							className="font-medium text-foreground underline-offset-4 hover:underline"
						>
							{m["auth.sign_in_link"]()}
						</Link>
					</p>
				</div>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<div className="w-full max-w-md">
				<div className="space-y-2">
					<h1 className="font-bold text-4xl tracking-tight">
						{m["auth.create_account"]()}
					</h1>
					<p className="text-muted-foreground leading-relaxed">
						{m["auth.sign_up_subtitle"]()}
					</p>
					{!inviteCode && (
						<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
							{m["auth.invite_only_note"]()}
						</p>
					)}
					{!emailSignUp && (
						<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
							{m["auth.email_signup_disabled_note"]()}
						</p>
					)}
					<OAuthErrorNotice code={oauthError} />
				</div>

				{emailSignUp && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="mt-8 space-y-5"
					>
						<form.Field name="name">
							{(field) => {
								const hasErrors = field.state.meta.errors.length > 0;
								const errorId = `${field.name}-error`;
								return (
									<div className="space-y-2">
										<Label htmlFor={field.name}>{m["auth.name"]()}</Label>
										<Input
											id={field.name}
											name={field.name}
											className="h-11 border-border bg-input"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder={m["auth.name_placeholder"]()}
											aria-invalid={hasErrors || undefined}
											aria-describedby={hasErrors ? errorId : undefined}
										/>
										{field.state.meta.errors.map((error) => (
											<p
												key={error?.message}
												id={errorId}
												role="alert"
												className="text-destructive text-sm"
											>
												{error?.message}
											</p>
										))}
									</div>
								);
							}}
						</form.Field>

						<form.Field name="username">
							{(field) => {
								const hasErrors = field.state.meta.errors.length > 0;
								const errorId = `${field.name}-error`;
								return (
									<div className="space-y-2">
										<Label htmlFor={field.name}>{m["auth.username"]()}</Label>
										<Input
											id={field.name}
											name={field.name}
											className="h-11 border-border bg-input"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder={m["auth.username_placeholder"]()}
											aria-invalid={hasErrors || undefined}
											aria-describedby={hasErrors ? errorId : undefined}
										/>
										{field.state.meta.errors.map((error) => (
											<p
												key={error?.message}
												id={errorId}
												role="alert"
												className="text-destructive text-sm"
											>
												{error?.message}
											</p>
										))}
									</div>
								);
							}}
						</form.Field>

						<form.Field name="email">
							{(field) => {
								const hasErrors = field.state.meta.errors.length > 0;
								const errorId = `${field.name}-error`;
								return (
									<div className="space-y-2">
										<Label htmlFor={field.name}>{m["auth.email"]()}</Label>
										<Input
											id={field.name}
											name={field.name}
											type="email"
											className="h-11 border-border bg-input"
											placeholder={m["auth.email_placeholder"]()}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={hasErrors || undefined}
											aria-describedby={hasErrors ? errorId : undefined}
										/>
										{field.state.meta.errors.map((error) => (
											<p
												key={error?.message}
												id={errorId}
												role="alert"
												className="text-destructive text-sm"
											>
												{error?.message}
											</p>
										))}
									</div>
								);
							}}
						</form.Field>

						<form.Field name="password">
							{(field) => {
								const hasErrors = field.state.meta.errors.length > 0;
								const errorId = `${field.name}-error`;
								return (
									<div className="space-y-2">
										<Label htmlFor={field.name}>{m["auth.password"]()}</Label>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											className="h-11 border-border bg-input"
											placeholder={m["auth.password_min_placeholder"]()}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={hasErrors || undefined}
											aria-describedby={hasErrors ? errorId : undefined}
										/>
										{field.state.meta.errors.map((error) => (
											<p
												key={error?.message}
												id={errorId}
												role="alert"
												className="text-destructive text-sm"
											>
												{error?.message}
											</p>
										))}
									</div>
								);
							}}
						</form.Field>

						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									className="h-11 w-full bg-foreground font-semibold text-background hover:bg-foreground/90"
									disabled={!state.canSubmit || state.isSubmitting}
								>
									{state.isSubmitting
										? m["auth.creating_account"]()
										: m["auth.sign_up"]()}
								</Button>
							)}
						</form.Subscribe>
					</form>
				)}

				{discordSignUp && (
					<>
						{emailSignUp && (
							<div className="relative my-6">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-background px-2 text-muted-foreground">
										{m["auth.or"]()}
									</span>
								</div>
							</div>
						)}

						<Button
							variant="outline"
							className={emailSignUp ? "h-11 w-full" : "mt-8 h-11 w-full"}
							onClick={() =>
								authClient.signIn.social({
									provider: "discord",
									callbackURL: `${window.location.origin}${redirectTo ?? "/dashboard"}`,
									errorCallbackURL: `${window.location.origin}${errorReturnPath}`,
									fetchOptions: inviteCode
										? { headers: { "x-invite-code": inviteCode } }
										: undefined,
								})
							}
						>
							<DiscordIcon className="mr-2 size-4" />
							{m["auth.sign_up_discord"]()}
						</Button>
					</>
				)}

				<p className="mt-6 text-muted-foreground text-sm">
					{m["auth.have_account"]()}{" "}
					<Link
						to="/login"
						search={{ redirect: redirectTo }}
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{m["auth.sign_in_link"]()}
					</Link>
				</p>
			</div>
		</main>
	);
}
