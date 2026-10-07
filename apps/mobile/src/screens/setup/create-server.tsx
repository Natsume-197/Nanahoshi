import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { slugify, slugOrFallback } from "@/lib/setup-flow";
import { usePlayer } from "@/player/provider";
import { useApi, useConnection } from "@/providers/app-provider";
import { space } from "@/theme";
import { SetupDone, SetupStep } from "./scaffold";

/**
 * Making a server is one question (its name; the slug follows it unless
 * edited), then the new server is the active one and the next step is
 * offered: its first library.
 */
export function CreateServer() {
	const { client } = useApi();
	const { auth } = useConnection();
	const queryClient = useQueryClient();
	const player = usePlayer();
	const nameRef = useRef("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [editingSlug, setEditingSlug] = useState(false);
	const [missing, setMissing] = useState(false);

	const create = useMutation({
		mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
			const server = await client.admin.createServer({ name, slug });
			// The new server is where the rest of the setup happens.
			await player.stop();
			const result = await auth.organization.setActive({
				organizationId: server.id,
			});
			if (result.error) throw new Error(result.error.message);
			// Made over RPC, not organization.create: tell the switcher's list.
			auth.$store.notify("$listOrg");
			await queryClient.cancelQueries();
			queryClient.clear();
			return server;
		},
	});

	if (create.data) {
		return (
			<SetupDone
				title={t("mobile.setup.server_done_title", { name: create.data.name })}
				lead={t("mobile.setup.server_done_lead")}
				footer={
					<>
						<Button
							label={t("mobile.setup.server_done_action")}
							onPress={() => router.replace("/setup/library")}
						/>
						<Button
							variant="secondary"
							label={t("mobile.setup.later")}
							onPress={() => router.back()}
						/>
					</>
				}
			/>
		);
	}

	const submit = () => {
		const name = nameRef.current.trim();
		setMissing(!name);
		if (!name || create.isPending) return;
		create.mutate({
			name,
			slug: slugTouched && slug ? slug : slugOrFallback(name),
		});
	};
	const error = missing
		? t("setup.err_name_required")
		: create.error
			? t("server.create_failed")
			: null;

	return (
		<SetupStep
			leading="close"
			title={t("mobile.setup.server_title")}
			lead={t("mobile.setup.server_lead")}
			footer={
				<Button
					label={t("server.create")}
					onPress={submit}
					loading={create.isPending}
				/>
			}
		>
			<View style={{ gap: space.md }}>
				<TextField
					label={t("setup.server_name")}
					placeholder={t("setup.server_name_placeholder")}
					autoFocus
					maxLength={80}
					returnKeyType="done"
					onSubmitEditing={submit}
					onChangeText={(text) => {
						nameRef.current = text;
						if (text.trim()) setMissing(false);
						if (!slugTouched) setSlug(slugify(text));
					}}
				/>
				{editingSlug ? (
					<TextField
						label={t("setup.slug")}
						value={slug}
						autoFocus
						autoCapitalize="none"
						autoCorrect={false}
						spellCheck={false}
						onChangeText={(text) => {
							setSlugTouched(true);
							setSlug(slugify(text));
						}}
					/>
				) : slug ? (
					<SlugLine slug={slug} onEdit={() => setEditingSlug(true)} />
				) : null}
				{error ? (
					<Text
						variant="subhead"
						tone="danger"
						accessibilityLiveRegion="polite"
					>
						{error}
					</Text>
				) : null}
			</View>
		</SetupStep>
	);
}

/** The slug as a quiet line under the name; most people never touch it. */
function SlugLine({ slug, onEdit }: { slug: string; onEdit: () => void }) {
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
			<Text
				variant="subhead"
				tone="secondary"
				numberOfLines={1}
				style={{ flexShrink: 1 }}
			>
				{t("mobile.setup.server_slug", { slug })}
			</Text>
			<Pressable onPress={onEdit} hitSlop={12} accessibilityRole="button">
				<Text variant="label" tone="accent">
					{t("mobile.setup.server_slug_edit")}
				</Text>
			</Pressable>
		</View>
	);
}
