import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import z from "zod";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/utils/orpc";

export function SignInForm({
	onSwitchToSignUp: _onSwitchToSignUp,
}: {
	onSwitchToSignUp: () => void;
}) {
	const navigate = useNavigate({
		from: "/",
	});
	const router = useRouter();
	const { isPending: _isPending } = authClient.useSession();
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());

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
						navigate({
							to: "/dashboard",
						});
						toast.success("Sign in successful");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<div className="w-full max-w-md">
				<div className="space-y-2">
					<h1 className="font-bold text-4xl tracking-tight">Welcome back</h1>
					<p className="text-muted-foreground leading-relaxed">
						Sign in to your library to continue.
					</p>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="mt-8 space-y-5"
				>
					<form.Field name="email">
						{(field) => {
							const hasErrors = field.state.meta.errors.length > 0;
							const errorId = `${field.name}-error`;
							return (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Email</Label>
									<Input
										id={field.name}
										name={field.name}
										type="email"
										className="h-11 border-border bg-input/40"
										placeholder="you@example.com"
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
									<Label htmlFor={field.name}>Password</Label>
									<Input
										id={field.name}
										name={field.name}
										type="password"
										className="h-11 border-border bg-input/40"
										placeholder="Your password"
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
								{state.isSubmitting ? "Signing in..." : "Sign In"}
							</Button>
						)}
					</form.Subscribe>
				</form>

				<div className="relative my-6">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background px-2 text-muted-foreground">or</span>
					</div>
				</div>

				<Button
					variant="outline"
					className="h-11 w-full"
					onClick={() =>
						authClient.signIn.social({
							provider: "discord",
							callbackURL: `${window.location.origin}/dashboard`,
						})
					}
				>
					<DiscordIcon className="mr-2 size-4" />
					Sign in with Discord
				</Button>

				{sso?.enabled && (
					<Button
						variant="outline"
						className="mt-3 h-11 w-full"
						onClick={() =>
							authClient.signIn.oauth2({
								providerId: sso.providerId,
								callbackURL: `${window.location.origin}/dashboard`,
							})
						}
					>
						<KeyRound className="mr-2 size-4" />
						Sign in with {sso.label}
					</Button>
				)}

				<p className="mt-6 text-muted-foreground text-sm">
					Need an account?{" "}
					<Link
						to="/sign-up"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						Sign up
					</Link>
				</p>
			</div>
		</main>
	);
}
