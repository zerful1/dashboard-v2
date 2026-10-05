import type { ReactNode } from "react";
import { Mark } from "@/components/ui/Mark";

/** Centred single-column frame shared by every unauthenticated screen. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Mark size={18} />
          Dashboard
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}
        {children && <div className="mt-7">{children}</div>}
        {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
