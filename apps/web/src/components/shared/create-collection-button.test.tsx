import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render, screen, within } = await import(
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
	test("starts with exactly the two collection type actions", () => {
		render(<CreateCollectionDialog open onOpenChange={() => {}} />);

		const dialog = screen.getByRole("region", { name: "Create collection" });
		const buttons = within(dialog).getAllByRole("button");

		expect(buttons).toHaveLength(2);
		expect(buttons[0]?.textContent).toBe("Create a manual collection");
		expect(buttons[1]?.textContent).toBe("Create a dynamic collection");
	});

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
