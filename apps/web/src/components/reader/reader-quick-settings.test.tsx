import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { defaultMangaReaderSettings } from "@/lib/reader/manga-settings";
import { defaultReaderSettings, readerThemes } from "@/lib/reader/settings";
import { ReaderQuickSettings } from "./reader-quick-settings";

test("separates book interpretation from comic page layout", () => {
	const onPresentationChange = mock(() => {});
	const onMangaSettingsChange = mock(() => {});
	const view = render(
		<ReaderQuickSettings
			presentation={{
				readAs: "auto",
				resolvedAs: "comic",
				textLayout: "scroll",
				comicLayout: "single-page",
				engine: "comic",
				supportsComic: true,
			}}
			mangaSettings={defaultMangaReaderSettings}
			settings={defaultReaderSettings}
			theme={readerThemes[0]}
			profiles={[
				{ id: "default", name: "Default", settings: defaultReaderSettings },
			]}
			activeProfileId="default"
			onProfileSwitch={() => {}}
			onChange={() => {}}
			onMangaSettingsChange={onMangaSettingsChange}
			onPresentationChange={onPresentationChange}
			onOpenSettings={() => {}}
			onClose={() => {}}
		/>,
	);

	const modeSelect = view.getAllByRole("combobox")[1];
	expect(
		Array.from(modeSelect.querySelectorAll("option"), (option) => option.value),
	).toEqual(["auto", "text", "comic"]);
	fireEvent.change(modeSelect, { target: { value: "text" } });
	expect(onPresentationChange).toHaveBeenCalledWith({
		type: "read-as",
		value: "text",
	});

	fireEvent.change(view.getAllByRole("combobox")[2], {
		target: { value: "vertical-strip" },
	});
	expect(onMangaSettingsChange).toHaveBeenCalledWith({
		layout: "vertical-strip",
	});
});

test("offers scroll and paginated layouts when reading as text", () => {
	const onPresentationChange = mock(() => {});
	const view = render(
		<ReaderQuickSettings
			presentation={{
				readAs: "text",
				resolvedAs: "text",
				textLayout: "paginated",
				comicLayout: "single-page",
				engine: "text-paginated",
				supportsComic: true,
			}}
			mangaSettings={defaultMangaReaderSettings}
			settings={defaultReaderSettings}
			theme={readerThemes[0]}
			profiles={[
				{ id: "default", name: "Default", settings: defaultReaderSettings },
			]}
			activeProfileId="default"
			onProfileSwitch={() => {}}
			onChange={() => {}}
			onMangaSettingsChange={() => {}}
			onPresentationChange={onPresentationChange}
			onOpenSettings={() => {}}
			onClose={() => {}}
		/>,
	);

	expect(view.container.querySelectorAll("select")[1]?.value).toBe("text");
	fireEvent.click(view.getByRole("button", { name: "Scroll" }));
	expect(onPresentationChange).toHaveBeenCalledWith({
		type: "text-layout",
		value: "scroll",
	});
});
