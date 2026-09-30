import { Check, MoveHorizontal, Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { SkinFront } from "@/components/SkinFront";
import { SkinViewer } from "@/components/SkinViewer";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { SavedSkin, SkinLook } from "@/types";

type Props = {
  playerName: string;
  look: SkinLook;
  saved: SavedSkin[];
  /** Skins d'origine de Minecraft (Steve, Alex…), lus dans le jeu installé. */
  defaults: SavedSkin[];
  activeId: string | null;
  onSelect: (skin: SavedSkin) => void;
  onAddFile: (file: File) => void;
  onEdit: () => void;
  /** Application en cours ou erreur de Mojang. */
  status?: { kind: "busy" | "error"; message: string } | null;
  animateSkin?: boolean;
};

/** Cadre de sélection de la barre d'inventaire, repris pour le skin porté. */
const selectedFrame = "outline-[3px] outline-offset-2 outline-[#e9e3d4] [outline-style:solid]";

function SkinTile({ skin, active, onSelect }: { skin: SavedSkin; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={cn(
          "relative flex aspect-[4/5] w-full flex-col items-center justify-end gap-2.5 rounded-lg border border-border bg-card pb-3 transition-colors hover:bg-[#241f19]",
          active && selectedFrame,
        )}
      >
        {active && (
          <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-[#e9e3d4] text-background">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
        )}
        <SkinFront texture={skin.texture} model={skin.model} scale={4} className="drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)]" />
        <span className="text-xs font-semibold">{skin.name}</span>
      </button>
    </li>
  );
}

function AddSkinTile({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-3 text-center transition-colors hover:border-muted-foreground",
          dragging && "border-accent bg-accent/5",
        )}
      >
        <Plus className="size-6" aria-hidden />
        <span className="text-sm font-semibold">Ajouter un skin</span>
        <span className="text-[11px] leading-snug text-muted-foreground">Clique ou glisse un fichier .png ici</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </li>
  );
}

const grid = "grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3";

export function SkinsScreen({ playerName, look, saved, defaults, activeId, onSelect, onAddFile, onEdit, status, animateSkin }: Props) {
  return (
    <main className="flex min-h-0 flex-1">
      <aside className="relative flex w-[clamp(280px,30vw,380px)] shrink-0 flex-col items-center justify-center gap-3 border-r border-border bg-[radial-gradient(ellipse_at_50%_45%,rgb(82_169_108/0.12),transparent_65%)]">
        <span className="rounded-[3px] bg-black/50 px-2 py-0.5 font-pixel text-[15px] text-white">{playerName}</span>
        <div className="relative">
          <div aria-hidden className="absolute bottom-9 left-1/2 h-5 w-32 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[7px]" />
          <SkinViewer look={look} width={230} height={360} animate={animateSkin} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MoveHorizontal className="size-3.5" aria-hidden />
          Glisse pour faire tourner
        </p>
        <button type="button" onClick={onEdit} className={secondaryButton}>
          <Pencil className="size-4" aria-hidden />
          Modifier le skin
        </button>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-10">
        <h1 className="font-display text-[30px] leading-none">Skins</h1>
        <p className="mt-2 max-w-[560px] text-sm text-muted-foreground">
          Le skin choisi s'applique à ton compte Minecraft&nbsp;: les autres joueurs le voient sur Clover Games comme sur tous les serveurs.
        </p>
        {status && (
          <p role={status.kind === "error" ? "alert" : "status"} className={cn("mt-3 text-sm", status.kind === "error" ? "text-[#ffb3b0]" : "text-muted-foreground")}>
            {status.message}
          </p>
        )}

        <section aria-labelledby="skins-saved" className="mt-7 flex flex-col gap-3">
          <h2 id="skins-saved" className="font-display text-xl">
            Mes skins
          </h2>
          <ul className={grid}>
            <AddSkinTile onFile={onAddFile} />
            {saved.map((skin) => (
              <SkinTile key={skin.id} skin={skin} active={skin.id === activeId} onSelect={() => onSelect(skin)} />
            ))}
          </ul>
        </section>

        {defaults.length > 0 && (
        <section aria-labelledby="skins-defaults" className="mt-8 flex flex-col gap-3">
          <h2 id="skins-defaults" className="font-display text-xl">
            Skins par défaut
          </h2>
          <ul className={grid}>
            {defaults.map((skin) => (
              <SkinTile key={skin.id} skin={skin} active={skin.id === activeId} onSelect={() => onSelect(skin)} />
            ))}
          </ul>
        </section>
        )}
      </div>
    </main>
  );
}
