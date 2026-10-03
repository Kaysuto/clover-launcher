import { ChevronDown, UserCog, UserPlus, X } from "lucide-react";
import { useState } from "react";

import { PlayerHead } from "@/components/PlayerHead";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Account } from "@/screens/SettingsScreen";
import type { Profile } from "@/types";

type Props = {
  /** Compte actif, affiché sur le bouton. */
  profile: Profile;
  skin: string | null;
  accounts: Account[];
  onUse: (uuid: string) => void;
  onRemove: (uuid: string) => void;
  onAdd: () => void;
  /** Ouvre Paramètres › Générales. */
  onManage: () => void;
  /** Ouvert d'office (planche des maquettes). */
  defaultOpen?: boolean;
};

const row = "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold";
const item = `${row} transition-colors hover:bg-secondary`;

/** Retire un compte du launcher ; partagé avec Paramètres › Générales. */
export function RemoveAccountButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Retirer ${name}`}
      title="Retirer ce compte"
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

/** Bascule entre comptes en un clic depuis la barre de titre. */
export function AccountMenu({ profile, skin, accounts, onUse, onRemove, onAdd, onManage, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Comptes"
          className="flex items-center gap-2 rounded-md py-1.5 pr-2 pl-1.5 text-[13px] font-semibold transition-colors hover:bg-secondary data-[state=open]:bg-secondary"
        >
          <PlayerHead skin={skin} size={24} />
          {profile.name}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        // Focus sur le menu, pas sur son premier bouton : Entrée retirerait le compte actif.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
        className="mc-frame w-[260px] gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 outline-none"
      >
        <ul className="flex flex-col p-1.5">
          {accounts.map((account) => (
            <li key={account.profile.uuid} className="flex items-center gap-1">
              {account.active ? (
                <div className={`${row} min-w-0 flex-1`}>
                  <PlayerHead skin={account.skin} size={28} />
                  <span className="flex-1 truncate">{account.profile.name}</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">Actif</span>
                </div>
              ) : (
                <button type="button" onClick={run(() => onUse(account.profile.uuid))} className={`${item} min-w-0 flex-1`}>
                  <PlayerHead skin={account.skin} size={28} />
                  <span className="flex-1 truncate">{account.profile.name}</span>
                </button>
              )}
              <RemoveAccountButton name={account.profile.name} onClick={() => onRemove(account.profile.uuid)} />
            </li>
          ))}
        </ul>

        <div className="flex flex-col border-t border-border p-1.5">
          <button type="button" onClick={run(onAdd)} className={`${item} text-muted-foreground hover:text-foreground`}>
            <UserPlus className="size-4" aria-hidden />
            Ajouter un compte
          </button>
          <button type="button" onClick={run(onManage)} className={`${item} text-muted-foreground hover:text-foreground`}>
            <UserCog className="size-4" aria-hidden />
            Gérer les comptes
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
