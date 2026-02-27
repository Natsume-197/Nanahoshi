import {
	Outlet,
	createFileRoute,
	redirect,
} from "@tanstack/react-router";
import { getBook } from "@/functions/get-book";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/books/$uuid")({
	component: BookLayout,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async ({ params }) => {
		const book = await getBook({ data: params.uuid });
		return { book };
	},
});

function BookLayout() {
	return <Outlet />;
}
