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
import { CircleCheckIcon } from "lucide-react";
import {
	InfoIcon,
	UsersIcon,
} from "lucide-react";
import { Button } from "../ui/button";

export function CreateWorkspaceForm() {
	return (
		<div className="w-full max-w-lg rounded-xl border bg-background shadow-sm">
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
						<Input autoComplete="off" id="name" placeholder="e.g., Acme, Inc." />
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
								<InputGroupInput id="slug" placeholder="e.g., acme" />
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
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							placeholder="Enter your email"
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
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password-repeat">Repeat password</Label>
							<Input
								id="password-repeat"
								type="password" 
								placeholder="Repeat your password"
								required
							/>
						</div>
					</div>
				</div>

				<div className="flex justify-end space-x-4">
					<Button type="submit">Create</Button>
				</div>

			</FieldGroup>

		</div>
	);
}
