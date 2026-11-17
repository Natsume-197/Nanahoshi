import { expect, test } from "bun:test";
import { filterSections } from "./settings-search";

const sections = [
	{
		key: "account",
		rows: [{ label: "Editar perfil" }, { label: "Privacidad" }],
	},
	{ key: "app", rows: [{ label: "Apariencia" }, { label: "Idioma" }] },
];

test("typing narrows to the matching rows and drops emptied sections", () => {
	expect(filterSections(sections, "priv")).toEqual([
		{ key: "account", rows: [{ label: "Privacidad" }] },
	]);
});

test("case and accents don't matter", () => {
	expect(filterSections(sections, "APARIEN")[0]?.rows).toEqual([
		{ label: "Apariencia" },
	]);
	expect(
		filterSections(
			[{ key: "x", rows: [{ label: "Configuración" }] }],
			"configuracion",
		),
	).toHaveLength(1);
});

test("an empty field shows everything; no match shows nothing", () => {
	expect(filterSections(sections, "  ")).toBe(sections);
	expect(filterSections(sections, "zzz")).toEqual([]);
});
