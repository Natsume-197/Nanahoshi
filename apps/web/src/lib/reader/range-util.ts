/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export function getNodeBoundingRect(document: Document, node: Node) {
	const range = document.createRange();
	range.selectNode(node);
	return range.getBoundingClientRect();
}
