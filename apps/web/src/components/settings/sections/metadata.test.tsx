import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

mock.module("@/utils/orpc", () => ({ client: {}, orpc: {}, queryClient: {} }));
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ProviderCard } = await import("./metadata");

afterEach(cleanup);

test("an unconfigured credential provider opens setup instead of enabling", () => {
	const toggle = mock(() => {});
	const configure = mock(() => {});
	const view = render(
		<ProviderCard
			provider="googlebooks"
			enabled={false}
			isLoading={false}
			isPending={false}
			onToggle={toggle}
			onConfigure={configure}
			configurationRequired
		/>,
	);
	fireEvent.click(view.getByRole("switch"));
	expect(configure).toHaveBeenCalledWith(true);
	expect(toggle).not.toHaveBeenCalled();
});
