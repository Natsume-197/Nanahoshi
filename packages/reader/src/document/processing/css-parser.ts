export interface Declaration {
	type: "declaration";
	property: string;
	value: string;
}

export interface Rule {
	type: "rule";
	selectors: string[];
	declarations: Declaration[];
}

const commentInValueRegex = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g;
const commentInSelectorRegex = /\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g;
const quotedStringRegex = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'/g;
const declarationValueRegex =
	/^((?:\/\*.*?\*\/|'(?:\\'|.)*?'|"(?:\\"|.)*?"|\((\s*'(?:\\'|.)*?'|"(?:\\"|.)*?"|[^)]*?)\s*\)|[^};])+)/;

export function parseCssRules(cssInput: string): Rule[] {
	let css = cssInput;
	const rules: Rule[] = [];

	const match = (re: RegExp) => {
		const m = re.exec(css);
		if (m) {
			css = css.slice(m[0].length);
			return m;
		}
		return undefined;
	};

	const whitespace = () => match(/^\s*/);

	const comment = () => {
		if (css[0] !== "/" || css[1] !== "*") return false;
		let i = 2;
		while (css[i] && (css[i] !== "*" || css[i + 1] !== "/")) i += 1;
		if (!css[i]) {
			css = "";
			return false;
		}
		css = css.slice(i + 2);
		return true;
	};

	const comments = () => {
		whitespace();
		while (comment()) whitespace();
	};

	const skipBlock = () => {
		let depth = 0;
		let i = 0;
		let sawOpen = false;
		for (; i < css.length; i += 1) {
			if (css[i] === "{") {
				depth += 1;
				sawOpen = true;
			} else if (css[i] === "}") {
				depth -= 1;
				if (depth <= 0) {
					i += 1;
					break;
				}
			}
		}
		css = sawOpen ? css.slice(i) : "";
	};

	const atRule = () => {
		if (match(/^@(import|charset|namespace|custom-media)\s*[^;{]*;/)) return;
		skipBlock();
	};

	const selector = (): string[] | undefined => {
		whitespace();
		const m = match(/^(("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|[^{])+)/);
		if (!m) return undefined;
		return m[0]
			.trim()
			.replace(commentInSelectorRegex, "")
			.replace(quotedStringRegex, (s) => s.replace(/,/g, "‌"))
			.split(/\s*(?![^(]*\)),\s*/)
			.map((s) => s.replace(/‌/g, ","));
	};

	const declaration = (): Declaration | undefined => {
		match(/^([;\s]*)+/);
		const prop = match(/^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/);
		if (!prop) return undefined;
		const property = prop[0].trim();
		if (!match(/^:\s*/)) return undefined;
		const val = match(declarationValueRegex);
		const result: Declaration = {
			type: "declaration",
			property: property.replace(commentInValueRegex, ""),
			value: val ? val[0].replace(commentInValueRegex, "").trim() : "",
		};
		match(/^[;\s]*/);
		return result;
	};

	const declarations = (): Declaration[] => {
		const decls: Declaration[] = [];
		if (!match(/^{\s*/)) return decls;
		comments();
		let d = declaration();
		while (d) {
			decls.push(d);
			comments();
			d = declaration();
		}
		match(/^}/);
		return decls;
	};

	comments();
	while (css.length) {
		if (css[0] === "@") {
			atRule();
			comments();
			continue;
		}
		if (css[0] === "}") {
			css = css.slice(1);
			comments();
			continue;
		}
		const sel = selector();
		if (!sel?.length) break;
		rules.push({ type: "rule", selectors: sel, declarations: declarations() });
		comments();
	}

	return rules;
}

export function stringifyCssRules(rules: Rule[]): string {
	return rules
		.map((rule) => {
			if (!rule.declarations.length) return "";
			const body = rule.declarations
				.map((d) => `${d.property}:${d.value};`)
				.join("");
			return `${rule.selectors.join(",")}{${body}}`;
		})
		.join("");
}
