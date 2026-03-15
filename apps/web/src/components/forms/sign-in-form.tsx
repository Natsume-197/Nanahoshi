import { useForm } from "@tanstack/react-form";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { LogoIcon } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

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
		<div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
			<div className="mb-8 flex flex-col items-center gap-3">
				<LogoIcon className="size-8 text-primary" />
				<h1 className="font-bold text-2xl tracking-tight">Welcome back</h1>
				<p className="text-muted-foreground text-sm">Sign in to your library</p>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-destructive text-sm">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-destructive text-sm">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<form.Subscribe>
					{(state) => (
						<Button
							type="submit"
							className="w-full"
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
				className="w-full"
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

			<div className="mt-4 text-center">
				<Button variant="link" asChild>
					<Link to="/sign-up">Need an account? Sign Up</Link>
				</Button>
			</div>
		</div>
	);
}
