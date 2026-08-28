import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const menu = readFileSync(
	new URL("./book-context-menu-content.tsx", import.meta.url),
	"utf8",
);
const contextMenu = readFileSync(
	new URL("../ui/context-menu.tsx", import.meta.url),
	"utf8",
);

describe("continue-card detail navigation", () => {
	test("offers a native menu link only for continue cards", () => {
		expect(menu).toContain("hasActiveBook && activeInContinueList");
		expect(menu).toContain("<ContextMenuLinkItem");
		expect(menu).toContain('m["home.hero_view_details"]()');
		expect(contextMenu).toContain("ContextMenuPrimitive.LinkItem");
	});

	test("routes books and audiobooks to their respective detail pages", () => {
		expect(menu).toContain('"/dashboard/books/$uuid"');
		expect(menu).toContain('"/dashboard/audiobooks/$uuid"');
		expect(menu).toContain("params={{ uuid: activeBookUuid }}");
	});
});

describe("permanent book deletion", () => {
	test("gates the destructive action on the delete permission", () => {
		expect(menu).toContain('can("book", "delete")');
		expect(menu).toContain('variant="destructive"');
		expect(menu).toContain('m["book.delete_permanently"]()');
	});

	test("requires an explicit modal confirmation and exposes pending state", () => {
		expect(menu).toContain('title={m["book.delete_confirm_title"]()}');
		expect(menu).toContain('m["book.delete_confirm_action"]()');
		expect(menu).toContain("aria-busy={isDeletePermanentlyBusy}");
		expect(menu).toContain("showCloseButton={!isDeletePermanentlyBusy}");
	});
});
