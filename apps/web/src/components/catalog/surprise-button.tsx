import { CircleNotch, Shuffle } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type { CatalogFormat } from "@/components/catalog/catalog-view";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

export function SurpriseButton({ format }: { format: CatalogFormat }) {
	const navigate = useNavigate();
	const [isShuffling, setIsShuffling] = useState(false);

	const handleSurprise = () => {
		if (isShuffling) return;
		setIsShuffling(true);
		const request =
			format === "audiobook"
				? client.audiobooks.listRandom({ limit: 1 })
				: client.books.listRandom({ limit: 1 });

		request
			.then((books) => {
				const pick = books[0];
				if (!pick) return;
				return navigate(
					format === "audiobook"
						? { to: "/dashboard/audiobooks/$uuid", params: { uuid: pick.uuid } }
						: { to: "/dashboard/books/$uuid", params: { uuid: pick.uuid } },
				);
			})
			.catch((err: unknown) =>
				toast.error(err instanceof Error ? err.message : String(err)),
			)
			.finally(() => setIsShuffling(false));
	};

	return (
		<Button
			type="button"
			variant="outline"
			onClick={handleSurprise}
			disabled={isShuffling}
			aria-busy={isShuffling}
			title={m["library_page.surprise_me"]()}
		>
			{isShuffling ? (
				<CircleNotch data-icon="inline-start" className="animate-spin" />
			) : (
				<Shuffle data-icon="inline-start" />
			)}
			{m["library_page.surprise_me"]()}
		</Button>
	);
}
