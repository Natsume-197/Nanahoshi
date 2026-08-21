/**
 * Leading column of an overlay rail: a full-height transparent strip whose top
 * carries the chrome nook. The rail floats over the content sheet, so the
 * sheet can't round its own top-right corner — this fills the corner instead,
 * mirroring the sheet's rounded top-left so the sheet reads as one plane
 * tucked under chrome on both sides.
 */
export function ChromeNotch() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none w-[var(--radius-2xl)] shrink-0"
		>
			<span className="theme-gradient-surface chrome-notch block bg-sidebar" />
		</div>
	);
}
