import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@/lib/posthog", () => ({ posthog: null }));

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutate: () => {},
		mutateAsync: async () => {},
	}),
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));

mock.module("@/components/collections/dynamic-collection-editor", () => ({
	DynamicCollectionEditor: () => <section aria-label="Dynamic editor" />,
}));

mock.module("@/components/ui/modal", () => ({
	Modal: ({
		title,
		children,
		footer,
		onSubmit,
	}: {
		title: string;
		children: React.ReactNode;
		footer?: React.ReactNode;
		onSubmit?: React.FormEventHandler<HTMLFormElement>;
	}) => (
		<section aria-label={title}>
			<form onSubmit={onSubmit}>
				{children}
				{footer}
			</form>
		</section>
	),
}));

mock.module("@/hooks/use-abilities", () => ({
	useAbilities: () => ({ can: () => true }),
}));

mock.module("@/utils/orpc", () => ({
	orpc: {
		collections: {
			create: { mutationOptions: () => ({}) },
			list: { queryOptions: () => ({ queryKey: ["collections"] }) },
		},
	},
}));

const { CreateCollectionDialog } = await import("./create-collection-button");

afterEach(cleanup);

describe("CreateCollectionDialog", () => {
	test("opens each editor only after its type is chosen", () => {
		const view = render(
			<CreateCollectionDialog open onOpenChange={() => {}} />,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Create a manual collection" }),
		);
		expect(screen.getByLabelText("Collection name")).toBeTruthy();

		view.unmount();
		render(<CreateCollectionDialog open onOpenChange={() => {}} />);
		fireEvent.click(
			screen.getByRole("button", { name: "Create a dynamic collection" }),
		);
		expect(screen.getByRole("region", { name: "Dynamic editor" })).toBeTruthy();
	});
});
