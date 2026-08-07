import Link from "next/link";

// One button, three looks, two sizes.
//
// Before this there were roughly a dozen: pills at py-2, py-2.5, py-3, py-3.5
// and py-4; uppercase 10px next to sentence-case 16px; some filled olive, some
// outlined, some outlined-that-fill-on-hover. On a screen with two of them the
// difference read as a mistake rather than a hierarchy.
//
// The rule now, and the only thing to remember when adding one:
//
//   primary    filled olive. The single most important action on a screen.
//              Never two on one screen.
//   secondary  outlined, ground-coloured. Everything else that's a button.
//              Fills olive on hover, which is where the "white then olive"
//              behaviour lives.
//   quiet      no border. A tertiary action that shouldn't compete — Cancel,
//              Back, Sign out.
//
// Sizes are `md` (the default, 44px — the floor for a comfortable thumb) and
// `sm` (36px) for controls inside a row or a card. There is no `lg`: the
// full-width py-4 slabs this replaced were the reason the screens felt heavy.
const BASE =
  "cb-press inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-center font-medium " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:cursor-default disabled:opacity-35 disabled:active:scale-100";

const VARIANTS = {
  // primary/on-primary, not ink/on-ink. They resolve to exactly the same
  // colours everywhere in the shop; the difference only shows inside the chat
  // panel, where the text is near-white and the buttons are blue. See
  // .cb-chat-surface in globals.css.
  primary:
    "border border-primary bg-primary text-on-primary hover:opacity-90 disabled:hover:opacity-35",
  secondary:
    "border border-line-soft bg-surface text-ink hover:border-ink hover:bg-ink hover:text-on-ink " +
    "disabled:hover:border-line-soft disabled:hover:bg-surface disabled:hover:text-ink",
  quiet: "border border-transparent text-muted hover:bg-raise hover:text-ink",
} as const;

const SIZES = {
  md: "h-11 px-6 text-[14px]",
  sm: "h-9 px-4 text-[13px]",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

function classesFor(variant: ButtonVariant, size: ButtonSize, block: boolean, extra?: string) {
  return [BASE, VARIANTS[variant], SIZES[size], block ? "w-full" : "", extra ?? ""]
    .filter(Boolean)
    .join(" ");
}

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Full width. Used for the one committing action at the bottom of a form,
  // not as a default — a button as wide as the screen reads as a banner.
  block?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  ...props
}: Shared & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // No haptic wired here any more. It was, and it covered this component and
  // nothing else — which is a twelfth of the app's controls, since the tiles,
  // chips, tabs, steppers and even Add to basket are raw buttons. One
  // delegated listener covers all of them now: see app/pressHaptics.ts.
  return (
    <button {...props} className={classesFor(variant, size, block, className)}>
      {children}
    </button>
  );
}

// The same thing that navigates. Kept as a separate export rather than an
// `as` prop so the href is type-checked and Next's prefetching applies.
export function ButtonLink({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  href,
  ...props
}: Shared &
  Omit<React.ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link {...props} href={href} className={classesFor(variant, size, block, className)}>
      {children}
    </Link>
  );
}

// An anchor for things Next shouldn't route — mailto, tel, external.
export function ButtonAnchor({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  ...props
}: Shared & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...props} className={classesFor(variant, size, block, className)}>
      {children}
    </a>
  );
}
