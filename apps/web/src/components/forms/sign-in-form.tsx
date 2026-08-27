import { Key } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { HydratedFieldset } from "@/components/forms/hydrated-fieldset";
import { OAuthErrorNotice } from "@/components/forms/oauth-error-notice";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export function SignInForm({
	onSwitchToSignUp: _onSwitchToSignUp,
	redirectTo,
	oauthError,
}: {
	onSwitchToSignUp: () => void;
	redirectTo?: string;
	oauthError?: string;
}) {
	const navigate = useNavigate({
		from: "/",
	});
	const router = useRouter();
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());
	// Arriving from an invite link (/invite/CODE) carries the code that opens
	// the invite-only sign-up gate — also across the Discord OAuth round-trip.
	const inviteCode = redirectTo?.match(/^\/invite\/([^/?#]+)/)?.[1];
	// Errors during the OAuth round-trip should land where they're visible:
	// the invite page when we came from one, this page otherwise.
	const errorReturnPath = inviteCode ? redirectTo : "/login";

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: async () => {
						queryClient.removeQueries({ queryKey: ["auth", "session"] });
						await router.invalidate();
						if (redirectTo) navigate({ href: redirectTo });
						else navigate({ to: "/dashboard" });
						toast.success(m["toast.sign_in_success"]());
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email(m["auth.err.email_invalid"]()),
				password: z.string().min(8, m["auth.err.password_min"]()),
			}),
		},
	});

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<div className="w-full max-w-md">
				<div className="space-y-2">
					<h1 className="font-bold text-4xl tracking-tight">
						{m["auth.welcome_back"]()}
					</h1>
					<p className="text-muted-foreground leading-relaxed">
						{m["auth.sign_in_subtitle"]()}
					</p>
					<OAuthErrorNotice code={oauthError} />
				</div>

				<form
					// React intercepts this after hydration. Before that point, a form
					// defaults to GET and leaks the password into the login URL.
					// POST keeps credentials in the request body during SSR hand-off.
					method="post"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="mt-8 space-y-5"
				>
					<HydratedFieldset className="contents">
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
											autoComplete="username"
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
											autoComplete="current-password"
											className="h-11 border-border bg-input"
											placeholder={m["auth.password_placeholder"]()}
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
										? m["auth.signing_in"]()
										: m["auth.sign_in"]()}
								</Button>
							)}
						</form.Subscribe>
					</HydratedFieldset>
				</form>

				{(sso?.discord || sso?.enabled) && (
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

				{sso?.discord && (
					<Button
						variant="outline"
						className="h-11 w-full"
						onClick={() =>
							authClient.signIn.social({
								provider: "discord",
								callbackURL: `${window.location.origin}${redirectTo ?? "/dashboard"}`,
								errorCallbackURL: `${window.location.origin}${errorReturnPath}`,
								additionalData: inviteCode ? { inviteCode } : undefined,
							})
						}
					>
						<DiscordIcon className="mr-2 size-4" />
						{m["auth.sign_in_discord"]()}
					</Button>
				)}

				{sso?.enabled && (
					<Button
						variant="outline"
						className="mt-3 h-11 w-full"
						onClick={() =>
							authClient.signIn.social({
								provider: sso.providerId,
								callbackURL: `${window.location.origin}${redirectTo ?? "/dashboard"}`,
								errorCallbackURL: `${window.location.origin}${errorReturnPath}`,
							})
						}
					>
						<Key className="mr-2 size-4" />
						{m["auth.sign_in_with"]({ provider: sso.label })}
					</Button>
				)}

				<p className="mt-6 text-muted-foreground text-sm">
					{m["auth.need_account"]()}{" "}
					<Link
						to="/sign-up"
						search={{ redirect: redirectTo }}
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{m["auth.sign_up_link"]()}
					</Link>
				</p>
			</div>
		</main>
	);
}
