export function sessionDuration(seconds: number) {
	const total = Math.max(0, Math.floor(seconds));
	return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
		.map((value) => String(value).padStart(2, "0"))
		.join(":");
}

export function readingDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	// Whole hours read "2 h", not "2 h 0 min", so round axis ticks stay short.
	return minutes % 60 === 0
		? `${minutes / 60} h`
		: `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
