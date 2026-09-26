// Neutral like the rest of the chrome: the active tab reads in full foreground
// with a foreground underline, never the accent.
export const DETAIL_TAB_BAR_CLASSNAME =
	"sticky top-0 z-20 border-border border-b bg-background/85 backdrop-blur-xl lg:mx-0 lg:px-0";

// Labels never wrap: an audiobook carries five tabs, which a phone can only fit
// by scrolling the row. The underline sits at bottom-0, inside the trigger, so
// it lands on the bar's hairline instead of becoming scrollable overflow.
export const DETAIL_TAB_LIST_CLASSNAME =
	"scrollbar-none h-14 w-full justify-start gap-6 overflow-x-auto overflow-y-hidden rounded-none group-data-horizontal/tabs:h-14 bg-transparent p-0 sm:gap-7";

export const DETAIL_TAB_TRIGGER_CLASSNAME =
	"h-full flex-none whitespace-nowrap rounded-none px-0 font-semibold text-[0.9375rem] text-muted-foreground leading-tight hover:text-foreground data-active:text-foreground sm:text-base dark:text-muted-foreground dark:data-active:text-foreground group-data-horizontal/tabs:after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground";
