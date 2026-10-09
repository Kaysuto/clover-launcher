import { ArrowRight, BookmarkPlus, Check, CircleAlert, CircleCheck, Download, LoaderCircle, MoveHorizontal, Pencil, Plus, Search, Shirt, Trash2, Undo2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { CapeFront } from "@/components/SkinFront";
import { SkinPose } from "@/components/SkinPose";
import { SkinViewer } from "@/components/SkinViewer";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { ownedCapeText } from "@/lib/capes";
import { cn } from "@/lib/utils";
import { CapeDialog } from "@/screens/Dialogs";
import { Discover, type Trial } from "@/screens/Discover";
import type { Cape, SavedSkin, SkinLook, SkinModel } from "@/types";

/** Application en cours, erreur, ou action faite (annulable si `undo`). */
export type SkinStatus = { kind: "busy" | "error" | "done"; message: string; undo?: () => void };

type Props = {
  playerName: string;
  look: SkinLook;
  saved: SavedSkin[];
  activeId: string | null;
  /** Porte un skin de la bibliothèque. */
  onSelect: (skin: SavedSkin) => void;
  onAddFile: (file: File) => void;
  onRename: (skin: SavedSkin, name: string) => void;
  /** Retire un skin de la bibliothèque locale, sans toucher au skin porté. */
  onRemove: (skin: SavedSkin) => void;
  onEdit: () => void;
  /** Capes possédées par le compte. */
  capes: Cape[];
  /** Skin de la Découverte ou du compte : ajouté à la bibliothèque, porté seulement si `wear`. */
  onRemoteSkin: (skin: { texture: string; model: SkinModel; name: string }, wear: boolean) => void;
  /** Porte une cape du compte, ou l'enlève (`null`), une fois confirmé. */
  onWearCape: (cape: Cape | null) => void;
  /** Enregistre un skin en .png là où le joueur le choisit. */
  onExport: (skin: { texture: string; name: string }) => void;
  status?: SkinStatus | null;
  onDismissStatus: () => void;
  animateSkin?: boolean;
};

/** Cadre de sélection de la barre d'inventaire, repris pour le skin essayé. */
const selectedFrame = "outline-[3px] outline-offset-2 outline-[#e9e3d4] [outline-style:solid]";
const iconButton = cn(secondaryButton, "w-9 px-0");
/** Au-delà, un champ permet de filtrer Mes skins par nom. */
const FILTER_FROM = 9;
/** Durée d'affichage d'une confirmation (« Skin porté », « Ajouté »…). */
const DONE_MS = 8000;

function TileAction({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-md bg-black/65 text-[#e9e3d4] transition-colors hover:bg-secondary [&>svg]:size-3.5",
        danger ? "hover:text-[#ffb3b0]" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type TileProps = {
  skin: SavedSkin;
  worn: boolean;
  tried: boolean;
  onTry: () => void;
  onRename: (name: string) => void;
  onExport: () => void;
  onRemove: () => void;
};

/**
 * Skin de la bibliothèque. Un clic l'essaie dans l'aperçu, rien n'est envoyé au compte ; les actions
 * apparaissent au survol ou au clavier. Le bouton d'essai couvre toute la carte, aperçu et nom passent
 * au-dessus sans capter le clic.
 */
function SkinTile({ skin, worn, tried, onTry, onRename, onExport, onRemove }: TileProps) {
  const [editing, setEditing] = useState(false);
  // Échap abandonne la saisie : le blur qui suit ne doit pas enregistrer.
  const keep = useRef(true);
  return (
    <li className="group relative flex aspect-[4/5] flex-col">
      <button
        type="button"
        aria-pressed={tried}
        aria-label={`Essayer ${skin.name}${worn ? ", porté actuellement" : ""}`}
        onClick={onTry}
        className={cn("absolute inset-0 rounded-lg border border-border bg-card transition-colors hover:bg-[#241f19]", tried && selectedFrame)}
      />
      {worn && (
        <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
          <Check className="size-3" strokeWidth={3} aria-hidden />
          Porté
        </span>
      )}
      {!editing && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
          <TileAction label={`Renommer ${skin.name}`} onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
          </TileAction>
          <TileAction label={`Exporter ${skin.name} en .png`} onClick={onExport}>
            <Download aria-hidden />
          </TileAction>
          <TileAction label={`Retirer ${skin.name} de mes skins`} danger onClick={onRemove}>
            <Trash2 aria-hidden />
          </TileAction>
        </div>
      )}
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center pt-3">
        <SkinPose texture={skin.texture} model={skin.model} className="h-full w-auto drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)]" />
      </div>
      <div className="relative flex h-8 items-center gap-1.5 border-t border-border px-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={skin.name}
            maxLength={32}
            aria-label={`Nouveau nom pour ${skin.name}`}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Escape") keep.current = false;
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            onBlur={(event) => {
              const name = event.currentTarget.value.trim();
              if (keep.current && name && name !== skin.name) onRename(name);
              keep.current = true;
              setEditing(false);
            }}
            className="h-6 min-w-0 flex-1 rounded-md border border-muted-foreground bg-[#100e0b] px-1.5 text-xs font-semibold outline-none"
          />
        ) : (
          <span title={skin.name} className="pointer-events-none min-w-0 flex-1 truncate text-xs font-semibold">
            {skin.name}
          </span>
        )}
        {!editing && skin.model === "slim" && (
          <span title="Bras fins (3 pixels)" className="pointer-events-none shrink-0 rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
            Fins
          </span>
        )}
      </div>
    </li>
  );
}

function AddSkinTile({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <li>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-3 text-center transition-colors hover:border-muted-foreground hover:bg-white/[0.02]"
      >
        <Plus className="size-6" aria-hidden />
        <span className="text-sm font-semibold">Ajouter un skin</span>
        <span className="text-[11px] leading-snug text-muted-foreground">Clique ou glisse un fichier .png ici</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png"
        multiple
        className="hidden"
        onChange={(event) => {
          for (const file of event.target.files ?? []) onFile(file);
          event.target.value = "";
        }}
      />
    </li>
  );
}

const grid = "grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3";

/** Cape du compte, ou « Aucune » (`cape` absent) ; le choix passe par une confirmation. */
function CapeTile({ cape, active, disabled, onSelect }: { cape?: Cape; active: boolean; disabled: boolean; onSelect: () => void }) {
  const text = cape && ownedCapeText(cape.name);
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        title={text ? `${text.name} : ${text.how}` : "Ne porter aucune cape"}
        onClick={onSelect}
        className={cn(
          "mc-slot relative flex h-[144px] w-full flex-col items-center justify-end gap-2 px-2 pb-2.5 transition-colors enabled:hover:bg-[#1b1813] disabled:opacity-60",
          active && selectedFrame,
        )}
      >
        {active && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[#e9e3d4] text-background">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
        )}
        <span className="grid flex-1 place-items-center">
          {cape ? <CapeFront texture={cape.texture} scale={5} className="drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)]" /> : <X className="size-6 text-muted-foreground" aria-hidden />}
        </span>
        <span className="line-clamp-2 min-h-[2lh] w-full text-center text-xs leading-tight font-semibold">{text?.name ?? "Aucune"}</span>
      </button>
    </li>
  );
}

function StatusBanner({ status, onDismiss }: { status: SkinStatus; onDismiss: () => void }) {
  const Icon = status.kind === "busy" ? LoaderCircle : status.kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={status.kind === "error" ? "alert" : "status"}
      className={cn(
        "mt-4 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200",
        status.kind === "error" && "border-[#ffb3b0]/25 bg-[#ffb3b0]/[0.07] text-[#ffb3b0]",
        status.kind === "done" && "border-primary/25 bg-primary/[0.09] text-foreground",
        status.kind === "busy" && "border-border bg-card text-muted-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", status.kind === "busy" && "animate-spin", status.kind === "done" && "text-primary")} aria-hidden />
      <span className="min-w-0 flex-1">{status.message}</span>
      {status.undo && (
        <button type="button" onClick={status.undo} className="flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
          <Undo2 className="size-3.5" aria-hidden />
          Annuler
        </button>
      )}
      {status.kind !== "busy" && (
        <button type="button" aria-label="Fermer le message" onClick={onDismiss} className="grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/[0.06]">
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Aperçu de l'essai : le skin essayé garde ta cape (ou celle du joueur), la cape essayée va sur ton skin. */
function trialLook(look: SkinLook, trial: Trial): SkinLook {
  if (trial.kind === "cape") return { ...look, cape: { id: trial.cape.id, name: trial.cape.title, texture: trial.cape.texture } };
  return { texture: trial.texture, model: trial.model, cape: trial.cape ? { id: "trial", name: trial.name, texture: trial.cape } : look.cape };
}

const tabClass = (selected: boolean) =>
  cn("flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground");

export function SkinsScreen(props: Props) {
  const { playerName, look, saved, activeId, onSelect, onAddFile, onRename, onRemove, onEdit, capes, onRemoteSkin, onWearCape, onExport, status, onDismissStatus, animateSkin } =
    props;
  const [view, setView] = useState<"mine" | "discover">("mine");
  /** La Découverte reste montée une fois ouverte : recherche et défilement sont gardés. */
  const [discoverOpened, setDiscoverOpened] = useState(false);
  const [discoverView, setDiscoverView] = useState<"skins" | "capes">("skins");
  const [trial, setTrial] = useState<Trial | null>(null);
  /** Cape choisie, en attente de confirmation : l'aperçu la montre déjà. */
  const [capeRequest, setCapeRequest] = useState<{ cape: Cape | null } | null>(null);
  const [filter, setFilter] = useState("");
  const [dropping, setDropping] = useState(false);
  const [elytra, setElytra] = useState(false);
  const shown = capeRequest ? { ...look, cape: capeRequest.cape } : trial ? trialLook(look, trial) : look;
  const triedSkin = trial?.kind === "skin" ? trial : null;
  const busy = status?.kind === "busy";
  const show = (id: "mine" | "discover", inside?: "skins" | "capes") => {
    setView(id);
    if (id === "discover") setDiscoverOpened(true);
    if (inside) setDiscoverView(inside);
  };

  // Une confirmation s'efface d'elle-même ; le rappel change à chaque rendu de l'application.
  const dismiss = useRef(onDismissStatus);
  dismiss.current = onDismissStatus;
  useEffect(() => {
    if (status?.kind !== "done") return;
    const timer = window.setTimeout(() => dismiss.current(), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  // Échap quitte l'essai, sauf dans un champ ou pendant la confirmation d'une cape.
  useEffect(() => {
    if (!trial) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || capeRequest || event.target instanceof HTMLInputElement) return;
      setTrial(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trial, capeRequest]);

  const wearTried = () => {
    if (!triedSkin) return;
    const entry = triedSkin.savedId ? saved.find((skin) => skin.id === triedSkin.savedId) : undefined;
    if (entry) onSelect(entry);
    else onRemoteSkin(triedSkin, true);
    setTrial(null);
  };

  const needle = filter.trim().toLocaleLowerCase("fr");
  const visible = needle ? saved.filter((skin) => skin.name.toLocaleLowerCase("fr").includes(needle)) : saved;

  return (
    <main className="flex min-h-0 flex-1">
      <aside className="relative flex w-[clamp(280px,30vw,380px)] shrink-0 flex-col items-center justify-center gap-3 border-r border-border bg-[radial-gradient(ellipse_at_50%_45%,rgb(82_169_108/0.12),transparent_65%)] px-4">
        <div className="flex items-center gap-2">
          {trial && <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">Essai</span>}
          {trial?.kind !== "cape" && (
            <span className="max-w-[260px] truncate rounded-[3px] bg-black/50 px-2.5 py-1 font-pixel text-xl leading-none text-white">{triedSkin?.name ?? playerName}</span>
          )}
          {trial?.kind === "cape" && <span className="rounded-[3px] bg-black/50 px-2.5 py-1 font-pixel text-xl leading-none text-white">{playerName}</span>}
        </div>
        <div className="relative">
          <div aria-hidden className="absolute bottom-9 left-1/2 h-5 w-32 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[7px]" />
          <SkinViewer look={shown} width={230} height={360} animate={animateSkin} elytra={elytra} />
          {shown.cape && (
            <div role="radiogroup" aria-label="Dos du personnage" className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-lg border border-border bg-[#100e0b]/90 p-0.5">
              {[
                { value: false, label: "Cape" },
                { value: true, label: "Élytres" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={elytra === option.value}
                  onClick={() => setElytra(option.value)}
                  className={cn("rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors", elytra === option.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MoveHorizontal className="size-3.5" aria-hidden />
          {animateSkin !== false ? "Fais-le tourner ou attrape-le" : "Glisse pour faire tourner"}
        </p>

        {/* Hauteur réservée : l'aperçu ne saute pas entre ton skin et un essai. */}
        <div className="flex min-h-[104px] w-full flex-col items-center justify-start gap-2.5">
          {triedSkin ? (
            <>
              <div className="flex gap-2">
                <button type="button" onClick={wearTried} disabled={busy} className={primaryButton}>
                  <Shirt className="size-4" aria-hidden />
                  Porter ce skin
                </button>
                {!triedSkin.savedId && (
                  <button type="button" onClick={() => onRemoteSkin(triedSkin, false)} title="Ajouter à mes skins" aria-label="Ajouter à mes skins" className={iconButton}>
                    <BookmarkPlus className="size-4" aria-hidden />
                  </button>
                )}
                <button type="button" onClick={() => onExport(triedSkin)} title="Exporter en .png" aria-label="Exporter en .png" className={iconButton}>
                  <Download className="size-4" aria-hidden />
                </button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">Rien n'est envoyé à ton compte tant que tu ne le portes pas.</p>
            </>
          ) : trial?.kind === "cape" ? (
            trial.owned ? (
              trial.owned.id !== look.cape?.id ? (
                <button type="button" onClick={() => setCapeRequest({ cape: trial.owned })} disabled={busy} className={primaryButton}>
                  <Shirt className="size-4" aria-hidden />
                  Porter cette cape
                </button>
              ) : (
                <p className="text-center text-xs text-muted-foreground">Tu portes déjà cette cape.</p>
              )
            ) : (
              <p className="max-w-[240px] text-center text-xs text-muted-foreground">Tu ne possèdes pas cette cape : Minecraft ne permet de porter que les siennes.</p>
            )
          ) : (
            <>
              <p className="text-center text-xs text-muted-foreground">
                Bras {look.model === "slim" ? "fins" : "classiques"} · {look.cape ? `cape ${ownedCapeText(look.cape.name).name}` : "sans cape"}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onEdit} className={secondaryButton}>
                  <Pencil className="size-4" aria-hidden />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => onRemoteSkin({ texture: look.texture, model: look.model, name: playerName }, false)}
                  disabled={!look.texture}
                  title="Garder ce skin dans Mes skins"
                  aria-label="Garder ce skin dans Mes skins"
                  className={iconButton}
                >
                  <BookmarkPlus className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onExport({ texture: look.texture, name: playerName })}
                  disabled={!look.texture}
                  title="Exporter mon skin en .png"
                  aria-label="Exporter mon skin en .png"
                  className={iconButton}
                >
                  <Download className="size-4" aria-hidden />
                </button>
              </div>
            </>
          )}
          {trial && (
            <button type="button" onClick={() => setTrial(null)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
              <Undo2 className="size-3.5" aria-hidden />
              Revenir à mon skin
              <kbd className="rounded border border-border px-1 font-sans text-[10px] font-semibold">Échap</kbd>
            </button>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto pb-10">
        <header className="px-10 pt-8">
          <h1 className="font-display text-[30px] leading-none">Skins</h1>
          <p className="mt-2 max-w-[560px] text-sm text-muted-foreground">
            Le skin choisi s'applique à ton compte Minecraft&nbsp;: les autres joueurs le voient sur Clover Games comme sur tous les serveurs.
          </p>
        </header>
        {/* Onglets et messages restent visibles en descendant jusqu'aux capes. */}
        <div className="sticky top-0 z-10 border-b border-border/70 bg-background px-10 pt-4 pb-3">
          <div role="tablist" aria-label="Skins" className="flex w-fit gap-1 rounded-lg border border-border bg-[#100e0b] p-1">
              <button type="button" role="tab" aria-selected={view === "mine"} onClick={() => show("mine")} className={tabClass(view === "mine")}>
                Mes skins
                <span className="rounded bg-white/[0.07] px-1.5 text-[11px] text-muted-foreground tabular-nums">{saved.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={view === "discover"} onClick={() => show("discover")} className={tabClass(view === "discover")}>
                Découverte
              </button>
          </div>
          {status && <StatusBanner status={status} onDismiss={onDismissStatus} />}
        </div>

        <div className="px-10">
          {discoverOpened && (
            <div hidden={view !== "discover"} className="mt-5">
              <Discover
                trial={trial}
                onTrial={setTrial}
                onSave={(skin) => onRemoteSkin(skin, false)}
                owned={capes}
                activeCapeId={look.cape?.id ?? null}
                view={discoverView}
                onView={setDiscoverView}
              />
            </div>
          )}

          <div hidden={view !== "mine"}>
            <section
              aria-labelledby="skins-saved"
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDropping(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropping(false);
                for (const file of event.dataTransfer.files) onAddFile(file);
              }}
              className={cn("mt-6 flex flex-col gap-3 rounded-xl transition-shadow duration-150", dropping && "ring-2 ring-accent ring-offset-8 ring-offset-background")}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="skins-saved" className="font-display text-xl">
                  Mes skins
                </h2>
                {saved.length >= FILTER_FROM && (
                  <label className="relative block w-56">
                    <span className="sr-only">Filtrer mes skins</span>
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input
                      type="search"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="Filtrer par nom…"
                      className="h-8 w-full rounded-md border border-border bg-[#100e0b] pr-2 pl-8 text-[13px] outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
                    />
                  </label>
                )}
              </div>
              <ul className={grid}>
                <AddSkinTile onFile={onAddFile} />
                {visible.map((skin) => (
                  <SkinTile
                    key={skin.id}
                    skin={skin}
                    worn={skin.id === activeId}
                    tried={triedSkin?.savedId === skin.id}
                    onTry={() => setTrial({ kind: "skin", name: skin.name, texture: skin.texture, model: skin.model, cape: null, savedId: skin.id })}
                    onRename={(name) => onRename(skin, name)}
                    onExport={() => onExport(skin)}
                    onRemove={() => {
                      if (triedSkin?.savedId === skin.id) setTrial(null);
                      onRemove(skin);
                    }}
                  />
                ))}
              </ul>
              {saved.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ajoute un fichier .png, ou{" "}
                  <button type="button" onClick={() => show("discover")} className="font-semibold text-foreground underline underline-offset-2 hover:text-primary">
                    trouve un skin dans la Découverte
                  </button>
                  , Steve et Alex compris.
                </p>
              ) : needle && visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun de tes skins ne s'appelle « {filter.trim()} ».</p>
              ) : (
                <p className="text-xs text-muted-foreground">Clique sur un skin pour l'essayer, puis « Porter ce skin » pour l'appliquer à ton compte.</p>
              )}
            </section>

            <section aria-labelledby="skins-capes" className="mt-10 flex flex-col gap-3">
              <h2 id="skins-capes" className="flex items-baseline gap-2 font-display text-xl">
                Mes capes
                {capes.length > 0 && <span className="font-sans text-sm font-semibold text-muted-foreground tabular-nums">{capes.length}</span>}
              </h2>
              {capes.length > 0 ? (
                <>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                    <CapeTile active={look.cape === null} disabled={busy} onSelect={() => look.cape !== null && setCapeRequest({ cape: null })} />
                    {capes.map((cape) => (
                      <CapeTile key={cape.id} cape={cape} active={look.cape?.id === cape.id} disabled={busy} onSelect={() => look.cape?.id !== cape.id && setCapeRequest({ cape })} />
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Clique sur une cape pour la porter (une confirmation t'est demandée) ; survole-la pour savoir comment elle s'obtient.</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ce compte ne possède aucune cape.</p>
              )}
              <button
                type="button"
                onClick={() => show("discover", "capes")}
                className="flex items-center gap-1.5 self-start text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                {capes.length > 0 ? "Voir toutes les capes de Minecraft" : "Voir comment en obtenir"}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </section>
          </div>
        </div>
      </div>

      <CapeDialog
        request={capeRequest}
        onCancel={() => setCapeRequest(null)}
        onConfirm={(cape) => {
          setCapeRequest(null);
          if (trial?.kind === "cape") setTrial(null);
          onWearCape(cape);
        }}
      />
    </main>
  );
}
