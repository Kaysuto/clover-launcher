import { FolderOpen, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { PlayerHead } from "@/components/PlayerHead";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { secondaryButton } from "@/lib/buttons";
import type { Profile } from "@/types";

export type Settings = {
  memoryAuto: boolean;
  /** Mémoire allouée au jeu, en Go. */
  memoryGb: number;
  gameDir: string;
  javaArgs: string;
  betaChannel: boolean;
  crashReports: boolean;
};

export type Account = { profile: Profile; skin: string; active: boolean };

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** Mémoire totale du poste et valeur automatique, en Go. */
  system: { totalMemoryGb: number; autoMemoryGb: number };
  accounts: Account[];
  onUseAccount: (uuid: string) => void;
  onRemoveAccount: (uuid: string) => void;
  onAddAccount: () => void;
  onOpenGameDir: () => void;
  onChangeGameDir: () => void;
  isStaff: boolean;
  about: { launcher: string; minecraft: string; fabric: string };
};

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[220px_1fr] gap-8 border-b border-border py-6 last:border-b-0">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-bold">{title}</h2>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function SettingsScreen(props: Props) {
  const { settings, onChange, system, accounts } = props;
  const memory = settings.memoryAuto ? system.autoMemoryGb : settings.memoryGb;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-12 pt-8 pb-10">
      <h1 className="font-display text-[30px] leading-none">Paramètres</h1>

      <div className="mt-4 max-w-[820px]">
        <Row title="Comptes" hint="Chaque compte Microsoft doit posséder Minecraft: Java Edition.">
          <ul className="flex flex-col gap-2">
            {accounts.map(({ profile, skin, active }) => (
              <li key={profile.uuid} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <PlayerHead skin={skin} size={28} />
                <span className="flex-1 text-sm font-semibold">{profile.name}</span>
                {active ? (
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">Compte actif</span>
                ) : (
                  <button type="button" onClick={() => props.onUseAccount(profile.uuid)} className="text-xs font-semibold text-foreground hover:underline">
                    Utiliser
                  </button>
                )}
                <button type="button" onClick={() => props.onRemoveAccount(profile.uuid)} className="text-xs font-semibold text-muted-foreground hover:text-destructive">
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={props.onAddAccount} className={`${secondaryButton} self-start`}>
            <Plus className="size-4" aria-hidden />
            Ajouter un compte
          </button>
        </Row>

        <Row title="Mémoire allouée" hint={`Ton ordinateur a ${system.totalMemoryGb} Go de mémoire. Trop en donner au jeu ralentit le reste du système.`}>
          <div className="flex items-center gap-3">
            <Switch id="memory-auto" checked={settings.memoryAuto} onCheckedChange={(memoryAuto) => onChange({ memoryAuto })} />
            <label htmlFor="memory-auto" className="text-sm">
              Automatique
            </label>
            <span className="ml-auto font-pixel text-[15px]">{memory} Go</span>
          </div>
          <Slider
            aria-label="Mémoire allouée"
            min={2}
            max={Math.max(4, system.totalMemoryGb - 2)}
            step={1}
            value={[memory]}
            disabled={settings.memoryAuto}
            onValueChange={([memoryGb]) => onChange({ memoryGb })}
          />
        </Row>

        <Row title="Dossier du jeu" hint="Mondes, captures d'écran, options et journaux. Séparé de ton dossier .minecraft.">
          <p className="truncate rounded-md border border-border bg-[#100e0b] px-3 py-2 font-mono text-xs select-text">{settings.gameDir}</p>
          <div className="flex gap-2">
            <button type="button" onClick={props.onOpenGameDir} className={secondaryButton}>
              <FolderOpen className="size-4" aria-hidden />
              Ouvrir le dossier
            </button>
            <button type="button" onClick={props.onChangeGameDir} className={secondaryButton}>
              Changer…
            </button>
          </div>
        </Row>

        <Row title="Rapports de plantage" hint="Version du launcher, système et message d'erreur. Jamais ton mot de passe ni tes jetons de connexion.">
          <div className="flex items-center gap-3">
            <Switch id="crash-reports" checked={settings.crashReports} onCheckedChange={(crashReports) => onChange({ crashReports })} />
            <label htmlFor="crash-reports" className="text-sm">
              Envoyer les rapports à l'équipe Clover Games
            </label>
          </div>
        </Row>

        <Row title="Avancé" hint="À ne modifier que si l'équipe te le demande.">
          <label className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
            Arguments Java
            <input
              value={settings.javaArgs}
              onChange={(event) => onChange({ javaArgs: event.target.value })}
              placeholder="Aucun"
              spellCheck={false}
              className="h-9 rounded-md border border-border bg-[#100e0b] px-3 font-mono text-xs text-foreground select-text"
            />
          </label>
          {props.isStaff && (
            <div className="flex items-center gap-3">
              <Switch id="beta" checked={settings.betaChannel} onCheckedChange={(betaChannel) => onChange({ betaChannel })} />
              <label htmlFor="beta" className="text-sm">
                Canal bêta <span className="text-muted-foreground">: reçoit les mises à jour de test avant les joueurs</span>
              </label>
            </div>
          )}
        </Row>

        <Row title="À propos">
          <p className="text-sm text-muted-foreground">
            Clover Launcher <span className="font-pixel text-[12px] text-foreground">{props.about.launcher}</span> · Minecraft{" "}
            <span className="font-pixel text-[12px] text-foreground">{props.about.minecraft}</span> · Fabric{" "}
            <span className="font-pixel text-[12px] text-foreground">{props.about.fabric}</span>
          </p>
        </Row>
      </div>
    </main>
  );
}
