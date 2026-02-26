import type React from "react";

export const LogoIcon = (props: React.ComponentProps<"svg">) => (
	// Nanahoshi text icon
	<svg
		fill="currentColor"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M12.785 12.781h11.172V24H12.785Zm0 0M.008 0h11.148v11.2H.008Zm0 0" />
	</svg>
);

export const Logo = (props: React.ComponentProps<"svg">) => (
	<svg
		viewBox="0 0 140 20"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<text
			x="5"
			y="16"
			fill="currentColor"
			fontSize="14"
			fontFamily="Inter, system-ui, sans-serif"
			fontWeight="600"
		>
			Nanahoshi
		</text>
	</svg>
);
