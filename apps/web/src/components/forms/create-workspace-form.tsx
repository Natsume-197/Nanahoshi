import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { Card, CardHeader } from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleCheckIcon, InfoIcon, UsersIcon } from "lucide-react";
import { Button } from "../ui/button";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function CreateWorkspaceForm() {
	const navigate = useNavigate();
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
		<form onSubmit={handleSubmit} className="w-full max-w-lg rounded-xl border bg-background shadow-sm">
			<Card>
				<CardHeader>
					<div className="flex flex-col space-y-1">
						<h1 className="font-bold text-2xl tracking-wide">Setup</h1>
						<p className="text-base text-muted-foreground">
							First, let's configure a few things
						</p>
					</div>
				</CardHeader>
			</Card>

			<FieldGroup className="p-4">
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 font-semibold text-lg">
						<InfoIcon className="size-5" />
						Workspace
					</h2>

					<Field className="gap-2">
						<FieldLabel htmlFor="name">Workspace Name</FieldLabel>
						<Input
							autoComplete="off"
							id="name"
							placeholder="e.g., Acme, Inc."
							value={workspaceName}
							onChange={(e) => setWorkspaceName(e.target.value)}
							required
						/>
						<FieldDescription>
							This is the name of your workspace on Nanahoshi.
						</FieldDescription>
					</Field>

					<Field className="gap-2">
						<FieldLabel htmlFor="slug">Workspace Slug</FieldLabel>
						<ButtonGroup>
							<ButtonGroupText>
								<Label htmlFor="slug">nanahoshi.com/</Label>
							</ButtonGroupText>
							<InputGroup>
								<InputGroupInput
									id="slug"
									placeholder="e.g., acme"
									value={workspaceSlug}
									onChange={(e) => setWorkspaceSlug(e.target.value)}
									required
								/>
								<InputGroupAddon align="inline-end">
									<CircleCheckIcon />
								</InputGroupAddon>
							</InputGroup>
						</ButtonGroup>
						<FieldDescription>
							This is your workspace's unique slug on Nanahoshi.
						</FieldDescription>
					</Field>
				</div>

				<div className="space-y-4">
					<h2 className="flex items-center gap-2 font-semibold text-lg">
						<UsersIcon className="size-5" />
						Account
					</h2>

					<div className="space-y-2">
						<Label htmlFor="username">Username</Label>
						<Input
							id="username"
							placeholder="Enter your username"
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
							placeholder="Enter your email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Enter your password"
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
								placeholder="Repeat your password"
								value={passwordRepeat}
								onChange={(e) => setPasswordRepeat(e.target.value)}
								required
								minLength={8}
							/>
						</div>
					</div>
				</div>

				<div className="flex justify-end space-x-4">
					<Button type="submit" disabled={isPending}>
						{isPending ? "Creating..." : "Create"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
