import {
	type Declaration,
	parseCssRules,
	type Rule,
	stringifyCssRules,
} from "./css-parser";

const htmlRegex = /\s?html\s?/gi;
const bodyRegex = /\s?body\s?/gi;

export function formatStyleSheet(
	styleSheetText: string,
	parentSelector: string,
): string {
	const newRules = parseCssRules(styleSheetText).filter(
		(r) => !r.selectors.some((s) => htmlRegex.test(s) || bodyRegex.test(s)),
	);

	for (const rule of newRules) {
		const newDeclarations: Record<string, string> = {};

		rule.declarations = rule.declarations.filter(
			(d) =>
				!/line-height$/.test(d.property) && !/text-indent$/.test(d.property),
		);

		const lineBreakFormatter = new LineBreakFormatter(
			rule.declarations,
			newDeclarations,
		);

		for (const declaration of rule.declarations) {
			assignKeyValToObj(
				newDeclarations,
				convertPrefixedDeclaration(declaration),
			);
			assignKeyValToObj(newDeclarations, convertFontFamily(declaration));
			assignKeyValToObj(
				newDeclarations,
				lineBreakFormatter.convert(declaration),
			);
		}

		for (const [property, value] of Object.entries(newDeclarations)) {
			rule.declarations.push({ type: "declaration", property, value });
		}

		rule.declarations = rule.declarations.filter(
			(d) => !/writing-mode\s*$/.test(d.property),
		);
	}

	newRules.push(getGeckoBrSolutionRule());

	for (const rule of newRules) {
		rule.selectors = rule.selectors.map(
			(selector) => `${parentSelector} ${selector}`,
		);
	}

	return stringifyCssRules(newRules);
}

function assignKeyValToObj(
	obj: Record<string, string>,
	keyValObj: { key: string; value: string } | undefined,
) {
	if (keyValObj) {
		obj[keyValObj.key] = keyValObj.value;
	}
	return obj;
}

function convertPrefixedDeclaration(declaration: Declaration) {
	const regexResult = /(?:(?:-epub-)|(?:-webkit-))(.+)/i.exec(
		declaration.property,
	);
	if (regexResult) {
		return {
			key: regexResult[1],
			value: declaration.value,
		};
	}
	return undefined;
}

function convertFontFamily(declaration: Declaration) {
	if (declaration.property === "font-family") {
		let newValue: string = declaration.value;
		if (newValue.includes("sans-serif")) {
			newValue = "var(--font-family-sans-serif, Noto Sans JP, sans-serif)";
		} else if (newValue.includes("serif")) {
			newValue = "var(--font-family-serif, Noto Serif JP, serif)";
		}
		return {
			key: declaration.property,
			value: newValue,
		};
	}
	return undefined;
}

class LineBreakFormatter {
	private hasLineBreakDefined?: boolean | undefined;

	constructor(
		private ruleDeclarations: Declaration[],
		private newDeclarations: Readonly<Record<string, string>>,
	) {}

	convert(declaration: Declaration) {
		if (
			/(?:(?:-epub-)|(?:-webkit-))?word-break$/i.exec(declaration.property) &&
			declaration.value === "break-all"
		) {
			if (this.hasLineBreakDefined === undefined) {
				this.hasLineBreakDefined = this.ruleDeclarations.some(
					(d) => d.type === "declaration" && d.property === "line-break",
				);
			}
			if (!this.hasLineBreakDefined && !this.newDeclarations["line-break"]) {
				// to allow breaking one long string of periods
				return {
					key: "line-break",
					value: "loose",
				};
			}
		}
		return undefined;
	}
}

function getGeckoBrSolutionRule(): Rule {
	// <br> + display: block makes it line-height: 0 on Firefox, when it creates
	// space on Chrome (regardless of display value)
	return {
		type: "rule",
		selectors: ["br"],
		declarations: [
			{
				type: "declaration",
				property: "display",
				value: "inline!important",
			},
		],
	};
}
