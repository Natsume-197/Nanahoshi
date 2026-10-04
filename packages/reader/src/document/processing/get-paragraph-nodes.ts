import { isNodeImage } from "./character-count";

export function getParagraphNodes(node: Node) {
	return getTextNodeOrImageNodes(node, (n) => {
		if (n.nodeName === "RT") {
			return false;
		}
		const isHidden =
			n instanceof HTMLElement &&
			(n.attributes.getNamedItem("aria-hidden") ||
				n.attributes.getNamedItem("hidden"));
		if (isHidden) {
			return false;
		}
		return true;
	}).filter((n) => {
		if (isNodeImage(n)) {
			return true;
		}
		if (n.textContent?.replace(/\s/g, "").length) {
			return true;
		}
		return false;
	});
}

function getTextNodeOrImageNodes(
	node: Node,
	filterFn: (n: Node) => boolean,
): Node[] {
	if (!node.hasChildNodes() || !filterFn(node)) {
		return [];
	}

	return Array.from(node.childNodes)
		.flatMap((n) => {
			if (n.nodeType === Node.TEXT_NODE) {
				return [n];
			}
			if (isNodeImage(n)) {
				return [n];
			}
			return getTextNodeOrImageNodes(n, filterFn);
		})
		.filter(filterFn);
}
