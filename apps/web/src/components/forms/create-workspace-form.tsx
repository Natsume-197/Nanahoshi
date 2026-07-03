import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";
import { Button } from "../ui/button";

type Step = 1 | 2;

export function CreateWorkspaceForm() {
	const navigate = useNavigate();
	const [step, setStep] = useState<Step>(1);
	const [workspaceName, setWorkspaceName] = useState("");
	const [workspaceSlug, setWorkspaceSlug] = useState("");
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [passwordRepeat, setPasswordRepeat] = useState("");

	const { mutate, isPending } = useMutation({
		...orpc.setup.complete.mutationOptions(),
		onSuccess: () => {
			toast.success("Setup complete!");
			navigate({ to: "/login" });
		},
		onError: (error) => {
			toast.error(error.message || "Failed to complete setup.");
		},
	});

	const goNext = () => {
		if (!workspaceName.trim() || !workspaceSlug.trim()) {
			toast.error("Please fill in the workspace details first.");
			return;
		}
		setStep(2);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (password !== passwordRepeat) {
			toast.error("Passwords do not match");
			return;
		}
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
					Initialize your server
				</h1>
				<p className="text-muted-foreground leading-relaxed">
					This Nanahoshi server is not initialized. Use the form below to create
					your workspace and admin account. Once created, you will have full
					access to all server features.
				</p>
			</div>

			<div className="mt-8 space-y-2">
				<div className="flex items-center gap-2">
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
				<p className="text-muted-foreground text-sm">
					Step {step} of 2 · {step === 1 ? "Workspace" : "Admin account"}
				</p>
			</div>

			<form onSubmit={handleSubmit} className="mt-6 space-y-6">
				{step === 1 ? (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								autoComplete="off"
								id="name"
								className="h-11 border-border bg-input"
								placeholder="e.g., My Library"
								value={workspaceName}
								onChange={(e) => setWorkspaceName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="slug">Slug</Label>
							<Input
								autoComplete="off"
								id="slug"
								className="h-11 border-border bg-input"
								placeholder="e.g., my-library"
								value={workspaceSlug}
								onChange={(e) => setWorkspaceSlug(e.target.value)}
							/>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								className="h-11 border-border bg-input"
								placeholder="your-username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								className="h-11 border-border bg-input"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								className="h-11 border-border bg-input"
								placeholder="Min. 8 characters"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password-repeat">Repeat password</Label>
							<Input
								id="password-repeat"
								type="password"
								className="h-11 border-border bg-input"
								placeholder="Confirm password"
								value={passwordRepeat}
								onChange={(e) => setPasswordRepeat(e.target.value)}
								required
								minLength={8}
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
						Next
					</Button>
				) : (
					<div className="flex gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => setStep(1)}
							className="h-11"
						>
							<ArrowLeftIcon />
							Back
						</Button>
						<Button
							type="submit"
							disabled={isPending}
							className="h-11 flex-1 bg-foreground font-semibold text-background hover:bg-foreground/90"
						>
							{isPending ? "Creating account..." : "Create Account"}
						</Button>
					</div>
				)}
			</form>
		</div>
	);
}
