import { forwardRef } from "react";
import { twMerge } from "tailwind-merge"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

  // forward the ref of the input element
const InputBeautiful = forwardRef<HTMLInputElement, InputProps>(({
  className,
  type,
  disabled,
  ...props
}, ref) => {
  return (
    <input
      type={type}
      className={twMerge(
        `
        relative w-full max-w-md mx-auto px-4 py-3 rounded-full bg-neutral-800 text-white focus:outline-none focus:ring-2 
      `, // the file is the special type, if we assign the i/p type to be file
        disabled && 'opacity-75',
        className
      )}
      disabled={disabled}
      ref={ref}
      {...props}
    />
  )
});

InputBeautiful.displayName = "InputBeautiful";

export default InputBeautiful