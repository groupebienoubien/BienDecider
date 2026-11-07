"use client";

import { useState } from "react";
import { searchTrades } from "@/lib/trades";

/** Recherche libre de métier : tape "res" -> propose "Restaurant". Accepte aussi un métier hors liste. */
export function TradeCombobox({
  value,
  onChange,
  id = "profile-trade",
  label = "Métier",
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Parcours d'entrée (#279) : « Votre activité », avec son message d'erreur. */
  id?: string;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = searchTrades(value);

  return (
    <div className="relative flex flex-col gap-3">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        required
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        placeholder="Votre métier (ex: plombier, restaurant...)"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        className="w-full rounded border px-3 py-2 text-sm"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border bg-white shadow-lg">
          {suggestions.map((t) => (
            <li key={t}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
