import Image from "next/image";
import Link from "next/link";
import logoDark from "@/public/brand/logo-dark.png";
import logoLight from "@/public/brand/logo-light.png";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "./theme-toggle";

/**
 * The Accountably logo (icon + name). Two transparent versions are stacked and
 * CSS shows the one that suits the theme: navy lettering on light, white on dark.
 * Artwork lives in brand/; `node scripts/make-icons.mjs` regenerates these files.
 */
export function Logo() {
  return (
    <Link
      href="/"
      aria-label="Accountably home"
      className="flex h-11 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Image src={logoLight} alt="Accountably" priority unoptimized className="h-8 w-auto dark:hidden" />
      <Image
        src={logoDark}
        alt=""
        aria-hidden="true"
        priority
        unoptimized
        className="hidden h-8 w-auto dark:block"
      />
    </Link>
  );
}

/** The bar at the top of every page: logo on the left, theme toggle on the right. */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between pb-3">
      <Logo />
      <ThemeToggle />
    </header>
  );
}

/** Thin horizontal bar. `value` is a whole percentage. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/** Large ring for the squad figure. `value` is a whole percentage, or null for "nothing yet". */
export function ProgressRing({ value }: { value: number | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : (value / 100) * circumference;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          className="stroke-muted"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-primary transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-heading text-3xl font-bold tabular-nums">
          {value === null ? "–" : value}
          {value !== null && <span className="text-lg">%</span>}
        </span>
      </div>
    </div>
  );
}

/** 44px ring with the percentage inside, for lists of weeks. `null` shows a dash. */
export function MiniRing({ value }: { value: number | null }) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : (value / 100) * circumference;
  return (
    <div className="relative size-11 shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-primary"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
        {value === null ? "–" : value}
      </span>
    </div>
  );
}

/** Small notice shown while the live connection is down. Data on screen stays. */
export function ReconnectingPill() {
  return (
    <div
      role="status"
      className="self-center rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground"
    >
      Reconnecting…
    </div>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-2xl border bg-card p-4", className)}
      {...props}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

export function PageError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-heading text-xl font-bold">Couldn&apos;t load your squad</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button size="touch" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Two- or three-way choice with large touch targets. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-10 flex-1 rounded-lg text-sm font-semibold text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option.value && "bg-card text-foreground shadow-xs",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
