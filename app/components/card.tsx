import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-surface border border-border rounded-md p-6 ${className}`}
    >
      {children}
    </div>
  );
}
