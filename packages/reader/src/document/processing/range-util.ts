export function getNodeBoundingRect(document: Document, node: Node) {
	const range = document.createRange();
	range.selectNode(node);
	return range.getBoundingClientRect();
}
