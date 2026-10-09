import { Pencil } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Nom modifiable sur place : le crayon ouvre un champ, Entrée enregistre, Échap annule. Un échec
 * rend l'ancien nom et passe le message à `onError`.
 */
export function InlineRename({
  value,
  label,
  onRename,
  onError,
  disabled = false,
  placeholder,
  className,
  pencilClassName,
  children,
}: {
  value: string;
  /** Ce qu'on renomme, pour le lecteur d'écran (« le monde Survie »). */
  label: string;
  onRename: (name: string) => Promise<void>;
  onError?: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  pencilClassName?: string;
  /** Affichage hors édition (le nom seul par défaut). */
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (draft === null) return;
    const name = draft.trim();
    if (name === value) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      await onRename(name);
      setDraft(null);
    } catch (reason) {
      onError?.(String(reason));
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={64}
        disabled={busy}
        placeholder={placeholder}
        aria-label={`Nouveau nom pour ${label}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") setDraft(null);
        }}
        onFocus={(event) => event.currentTarget.select()}
        className={cn("h-7 min-w-0 flex-1 rounded-md border border-accent bg-[#100e0b] px-2 text-sm font-semibold text-foreground outline-none select-text", className)}
      />
    );
  }

  return (
    <span className={cn("group/rename flex min-w-0 flex-1 items-center gap-1", className)}>
      {children ?? (
        <span className="min-w-0 truncate" title={value}>
          {value}
        </span>
      )}
      {!disabled && (
        <button
          type="button"
          onClick={() => setDraft(value)}
          aria-label={`Renommer ${label}`}
          title="Renommer"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/rename:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100",
            pencilClassName,
          )}
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}
