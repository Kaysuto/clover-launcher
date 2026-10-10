import { ArrowRight, Check, Circle, Clock, Copy, FolderOpen, LoaderCircle, PenLine, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PlayerHead } from "@/components/PlayerHead";
import { ShareLogButton } from "@/components/ShareLogButton";
import { CapeFront } from "@/components/SkinFront";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NameAvailability, NameChange } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { ownedCapeText } from "@/lib/capes";
import { cn } from "@/lib/utils";
import type { Cape, SkinModel } from "@/types";

const content = "mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[560px]";
const footer = "-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4";

export function CrashDialog(props: {
  open: boolean;
  exitCode: number | null;
  logTail: string;
  /** Sortie complète de la partie, publiée par « Partager ». */
  log: string;
  onCopyLog: () => void;
  onOpenLogs: () => void;
  onRelaunch: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Minecraft s'est arrêté</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Le jeu s'est fermé avec le code {props.exitCode ?? "inconnu"}. Si ça recommence, partage le journal et envoie le lien au support sur le Discord.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-44 overflow-auto rounded-md border border-border bg-[#0c0b09] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#cfc8b8] select-text">
          {props.logTail}
        </pre>
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCopyLog} className={secondaryButton}>
            <Copy className="size-4" aria-hidden />
            Copier
          </button>
          <ShareLogButton log={() => props.log} disabled={!props.log} />
          <button type="button" onClick={props.onOpenLogs} className={secondaryButton}>
            <FolderOpen className="size-4" aria-hidden />
            Ouvrir les journaux
          </button>
          <button type="button" onClick={props.onRelaunch} className={primaryButton}>
            <RotateCcw className="size-4" aria-hidden />
            Relancer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation avant de changer de cape : elle s'applique au compte Minecraft. `cape` à `null` : l'enlever. */
export function CapeDialog(props: { request: { cape: Cape | null } | null; onConfirm: (cape: Cape | null) => void; onCancel: () => void }) {
  // Garde la dernière demande affichée pendant l'animation de fermeture.
  const last = useRef(props.request);
  if (props.request) last.current = props.request;
  const cape = last.current?.cape ?? null;
  const text = cape && ownedCapeText(cape.name);
  return (
    <Dialog open={props.request !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{text ? `Porter la cape « ${text.name} » ?` : "Enlever ta cape ?"}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {text
              ? "Elle remplace ta cape actuelle sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs."
              : "Ton personnage n'aura plus de cape sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs."}
          </DialogDescription>
        </DialogHeader>
        {cape && text && (
          <div className="flex items-center gap-4">
            <span className="mc-slot grid size-24 shrink-0 place-items-center">
              <CapeFront texture={cape.texture} scale={4.5} />
            </span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{text.how}</p>
          </div>
        )}
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={() => props.onConfirm(cape)} className={primaryButton}>
            <Check className="size-4" aria-hidden />
            {cape ? "Porter cette cape" : "Enlever la cape"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation avant de changer les bras du skin porté : ils s'appliquent au compte Minecraft. */
export function ModelDialog(props: { request: SkinModel | null; onConfirm: (model: SkinModel) => void; onCancel: () => void }) {
  // Garde la dernière demande affichée pendant l'animation de fermeture.
  const last = useRef(props.request);
  if (props.request) last.current = props.request;
  const model = last.current ?? "classic";
  const slim = model === "slim";
  return (
    <Dialog open={props.request !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{slim ? "Passer aux bras fins ?" : "Passer aux bras classiques ?"}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Tes bras feront {slim ? "3" : "4"} pixels de large sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs. Un skin dessiné pour des bras{" "}
            {slim ? "classiques" : "fins"} peut alors paraître décalé.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={() => props.onConfirm(model)} className={primaryButton}>
            <Check className="size-4" aria-hidden />
            {slim ? "Passer aux bras fins" : "Passer aux bras classiques"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Règle de Mojang, reprise par `player_name::validate`. */
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const NAME_CHARS = /^[A-Za-z0-9_]*$/;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type RuleState = "pending" | "checking" | "ok" | "error";
const RULE_ICON = { pending: Circle, checking: LoaderCircle, ok: Check, error: X };
const RULE_TONE = { pending: "text-muted-foreground", checking: "text-muted-foreground", ok: "text-primary", error: "text-destructive" };

/** Changement de pseudo Java du compte actif, depuis le menu du compte. */
export function NameDialog(props: {
  open: boolean;
  /** Pseudo actuel du compte actif. */
  current: string;
  /** Texture du skin porté, pour les têtes de l'aperçu. */
  skin: string | null;
  info: () => Promise<NameChange>;
  check: (name: string) => Promise<NameAvailability>;
  /** Rejette avec le message de Mojang, prêt à afficher. */
  onSubmit: (name: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, current, info, check } = props;
  const [name, setName] = useState("");
  const [change, setChange] = useState<NameChange | null>(null);
  const [availability, setAvailability] = useState<NameAvailability | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setName("");
    setChange(null);
    setError(null);
    info()
      .then((result) => !cancelled && setChange(result))
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [open, info]);

  const valid = NAME.test(name);
  // Seule la casse change : Mojang le permet, et le pseudo « pris » est le sien.
  const sameName = name.toLowerCase() === current.toLowerCase();

  useEffect(() => {
    setAvailability(null);
    if (!open || !valid || sameName) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAvailability("checking");
      // Vérification indicative : en cas d'échec, Mojang tranche à l'envoi.
      check(name)
        .then((result) => !cancelled && setAvailability(result))
        .catch(() => !cancelled && setAvailability(null));
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, name, valid, sameName, check]);

  const blocked = change?.allowed === false;
  const next = blocked && change.changedAt ? new Date(Date.parse(change.changedAt) + COOLDOWN_MS) : null;
  const canSubmit = valid && name !== current && !blocked && availability !== "taken" && availability !== "not_allowed" && !saving;

  const free: [RuleState, string] = !valid
    ? ["pending", "Libre chez Mojang"]
    : name === current
      ? ["error", "C'est déjà ton pseudo"]
      : sameName
        ? ["ok", "Ton pseudo, autre casse"]
        : availability === "checking"
          ? ["checking", "Vérification auprès de Mojang…"]
          : availability === "available"
            ? ["ok", "Libre chez Mojang"]
            : availability === "taken"
              ? ["error", "Déjà pris par un autre joueur"]
              : availability === "not_allowed"
                ? ["error", "Refusé par Mojang"]
                : ["pending", "Libre chez Mojang"];
  const rules: [RuleState, string][] = [
    [name.length >= 3 ? "ok" : "pending", "3 à 16 caractères"],
    [name === "" ? "pending" : NAME_CHARS.test(name) ? "ok" : "error", "Lettres sans accent, chiffres et _"],
    free,
  ];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSubmit(name);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && props.onOpenChange(value)}>
      <DialogContent className={content}>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Changer de pseudo</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Ton pseudo change partout, sur Clover Games comme sur tous les serveurs. Mojang n'en permet qu'un changement tous les 30 jours.
            </DialogDescription>
          </DialogHeader>

          {/* Aperçu façon liste des joueurs du jeu : avant, après. */}
          <div aria-hidden className="mc-slot flex min-w-0 items-center gap-3 px-4 py-3 font-pixel text-[13px] mc-text-shadow [--mc-radius:6px]">
            <PlayerHead skin={props.skin} size={20} />
            <span className="truncate text-muted-foreground">{current}</span>
            <ArrowRight className="size-4 shrink-0 text-accent" />
            <PlayerHead skin={props.skin} size={20} />
            <span className={cn("truncate", name ? "text-white" : "text-muted-foreground/50")}>{name || "?"}</span>
          </div>

          {blocked && (
            <p className="flex items-start gap-2 rounded-md border border-border bg-[#100e0b] px-3 py-2.5 text-[13px] leading-relaxed">
              <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {next
                ? `Ton pseudo a changé il y a moins de 30 jours. Prochain changement possible le ${next.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
                : "Mojang n'autorise pas encore de nouveau changement pour ce compte."}
            </p>
          )}

          <div className="grid gap-2.5">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Nouveau pseudo</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value.trim());
                  setError(null);
                }}
                disabled={blocked || saving}
                autoFocus
                maxLength={16}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="name-rules"
                className="h-10 w-full rounded-md border border-border bg-[#100e0b] px-3 font-pixel text-sm text-foreground outline-none select-text focus:border-accent disabled:opacity-60"
              />
            </label>
            <ul id="name-rules" aria-live="polite" className="grid gap-1.5 text-[12px]">
              {rules.map(([state, text], index) => {
                const Icon = RULE_ICON[state];
                return (
                  <li key={index} className={cn("flex items-center gap-2", RULE_TONE[state])}>
                    <Icon className={cn("size-3.5 shrink-0", state === "checking" && "animate-spin")} aria-hidden />
                    {text}
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="text-[12px] text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className={footer}>
            <button type="button" onClick={() => props.onOpenChange(false)} disabled={saving} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={!canSubmit} className={primaryButton}>
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
              Changer de pseudo
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
