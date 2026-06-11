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

export function getReferencePoints(
	window: Window,
	element: Element,
	verticalMode: boolean,
	firstDimensionMarginValue: number,
	bottomGap = 0,
) {
	const firstDimensionMargin = Math.min(
		Math.max(firstDimensionMarginValue, 0),
		verticalMode ? window.innerWidth / 4 : window.innerHeight / 4,
	);
	const rect = element.getBoundingClientRect();
	const elLeftReferencePoint = verticalMode ? firstDimensionMargin : rect.left;
	const elRightReferencePoint = verticalMode
		? window.innerWidth - firstDimensionMargin
		: rect.right;
	const elTopReferencePoint = verticalMode ? rect.top : firstDimensionMargin;
	const elBottomReferencePoint = verticalMode
		? rect.bottom
		: window.innerHeight - firstDimensionMargin - bottomGap;
	const pointGap = Number(
		getComputedStyle(element).lineHeight.replace(/px$/, ""),
	);

	return {
		elLeftReferencePoint,
		elRightReferencePoint,
		elTopReferencePoint,
		elBottomReferencePoint,
		firstDimensionMargin,
		pointGap,
	};
}
