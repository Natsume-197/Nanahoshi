import {
	CheckCircle,
	CircleNotch,
	Info,
	Warning,
	XCircle,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			position="top-center"
			className="toaster group"
			icons={{
				success: <CheckCircle className="size-5 text-success" />,
				info: <Info className="size-5" />,
				warning: <Warning className="size-5" />,
				error: <XCircle className="size-5 text-destructive" />,
				loading: <CircleNotch className="size-5 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--color-white)",
					"--normal-text": "var(--color-neutral-950)",
					"--normal-border": "var(--color-neutral-200)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				style: {
					width: "fit-content",
					minWidth: "min(12rem, calc(100vw - 2rem))",
					maxWidth: "min(19rem, calc(100vw - 2rem))",
					left: 0,
					right: 0,
					marginInline: "auto",
					justifyContent: "center",
					textAlign: "center",
				},
				classNames: {
					toast: "cn-toast",
					content: "items-center text-center",
					icon: "!m-0 !size-5",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
