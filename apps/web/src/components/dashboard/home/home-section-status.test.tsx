import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	HomeSectionStatusProvider,
	useHomeSectionLoadingPlaceholder,
} from "./home-section-status";

function LoadingProbe() {
	return useHomeSectionLoadingPlaceholder() ? <span>placeholder</span> : null;
}

describe("HomeSectionStatusProvider", () => {
	test("keeps priority placeholders and suppresses deferred placeholders", () => {
		const priority = renderToStaticMarkup(
			<HomeSectionStatusProvider
				onStatus={() => {}}
				suppressLoadingPlaceholder={false}
			>
				<LoadingProbe />
			</HomeSectionStatusProvider>,
		);
		const deferred = renderToStaticMarkup(
			<HomeSectionStatusProvider onStatus={() => {}} suppressLoadingPlaceholder>
				<LoadingProbe />
			</HomeSectionStatusProvider>,
		);

		expect(priority).toContain("placeholder");
		expect(deferred).toBe("");
	});
});
