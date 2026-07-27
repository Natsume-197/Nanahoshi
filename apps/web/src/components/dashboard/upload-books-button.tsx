import { UploadSimple } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getUploadableLibraries } from "@/components/libraries/library-ui-state";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** Navbar shortcut: upload one or more books without going through a library page. */
export function UploadBooksButton() {
	const { can } = useAbilities();
	const canUpload = can("library", "upload");
	const [open, setOpen] = useState(false);
	const { data: libraries } = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		enabled: canUpload,
	});

	const uploadable = getUploadableLibraries(libraries ?? []);
	if (!canUpload || uploadable.length === 0) return null;

	return (
		<>
			<Button
				type="button"
				variant="secondary"
				size="lg"
				aria-label={m["nav.upload"]()}
				onClick={() => setOpen(true)}
				className="hidden rounded-full md:inline-flex [&_svg]:size-[18px]"
			>
				<UploadSimple />
				{m["nav.upload"]()}
			</Button>
			<UploadBooksModal
				libraries={uploadable}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}
