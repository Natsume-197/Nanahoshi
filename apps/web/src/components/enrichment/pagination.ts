export function visiblePageNumbers(
	currentPage: number,
	totalPages: number,
): number[] {
	if (totalPages <= 0) return [];

	const clampedCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}

	if (clampedCurrentPage <= 4) {
		return [1, 2, 3, 4, 5, totalPages];
	}

	if (clampedCurrentPage >= totalPages - 3) {
		return [
			1,
			totalPages - 4,
			totalPages - 3,
			totalPages - 2,
			totalPages - 1,
			totalPages,
		];
	}

	return [
		1,
		clampedCurrentPage - 1,
		clampedCurrentPage,
		clampedCurrentPage + 1,
		totalPages,
	];
}
