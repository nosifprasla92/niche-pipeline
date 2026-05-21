"use client";

import { useId } from "react";

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  pending = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  const id = useId();
  const isInteractive = !disabled && !pending;

  function handleClick() {
    if (!isInteractive) return;
    onChange(!checked);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isInteractive) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  }

  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 py-2.5 select-none ${
        isInteractive ? "cursor-pointer" : "cursor-default"
      }`}
      onClick={handleClick}
    >
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        aria-busy={pending || undefined}
        disabled={disabled || pending}
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          e.stopPropagation();
          if (isInteractive) onChange(!checked);
        }}
        className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-sm border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-0 ${
          checked
            ? "bg-accent border-accent text-white"
            : "bg-surface border-border hover:border-muted"
        } ${pending ? "opacity-50" : ""} ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <span
        className={`text-base leading-relaxed ${
          checked ? "line-through text-muted" : "text-text"
        }`}
      >
        {label}
      </span>
    </label>
  );
}
