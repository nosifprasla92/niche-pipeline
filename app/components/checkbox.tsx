"use client";

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

  // Single click target: the row is a button-role element. We avoid <label
  // htmlFor=...> + nested <button> because native label-forwarding in Chrome
  // can re-dispatch the click to the inner button, firing onChange twice.
  return (
    <div
      role="checkbox"
      tabIndex={isInteractive ? 0 : -1}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
      aria-label={label}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`flex items-start gap-3 py-2.5 select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm ${
        isInteractive ? "cursor-pointer" : "cursor-default"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-sm border transition-colors ${
          checked
            ? "bg-accent border-accent text-white"
            : "bg-surface border-border"
        } ${pending ? "opacity-50" : ""}`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        className={`text-base leading-relaxed ${
          checked ? "line-through text-muted" : "text-text"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
