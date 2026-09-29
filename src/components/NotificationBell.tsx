import { Bell, Gift, type LucideIcon, Megaphone, ShoppingBag, Star, Trophy, Vote } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { LauncherNotification, NotificationKind } from "@/types";

const KINDS: Record<NotificationKind, { Icon: LucideIcon; color: string }> = {
  level: { Icon: Star, color: "text-accent" },
  achievement: { Icon: Trophy, color: "text-accent" },
  purchase: { Icon: ShoppingBag, color: "text-primary" },
  reward: { Icon: Gift, color: "text-primary" },
  vote: { Icon: Vote, color: "text-primary" },
  announcement: { Icon: Megaphone, color: "text-[#8fb8f5]" },
};

const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

function ago(date: string) {
  const minutes = Math.round((new Date(date).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

type Props = {
  items: LauncherNotification[];
  onOpen: (item: LauncherNotification) => void;
  onReadAll: () => void;
  /** Ouvert d'office (planche des maquettes). */
  defaultOpen?: boolean;
};

/**
 * Notifications du site (achats, succès, annonces) et du jeu (niveau gagné, récompenses) réunies.
 * La pastille compte les non lues ; ouvrir la liste ne les marque pas lues, seul un clic le fait.
 */
export function NotificationBell({ items, onOpen, onReadAll, defaultOpen }: Props) {
  const unread = items.filter((item) => !item.read).length;

  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
          title="Notifications"
          className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-accent"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-[#100e0b] bg-destructive px-1 font-pixel text-[10px] leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="mc-frame w-[360px] gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg leading-none">Notifications</h2>
          {unread > 0 && (
            <button type="button" onClick={onReadAll} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Tout marquer comme lu
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification pour le moment.</p>
        ) : (
          <ul className="max-h-[380px] overflow-y-auto p-1.5">
            {items.map((item) => {
              const { Icon, color } = KINDS[item.kind];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className={cn("flex w-full gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-secondary", !item.read && "bg-[#221e18]")}
                  >
                    <span className={cn("mc-slot grid size-9 shrink-0 place-items-center [--mc-radius:6px]", color)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold">{item.title}</span>
                        {!item.read && <span aria-label="Non lue" className="size-2 shrink-0 rounded-full bg-destructive" />}
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{item.message}</span>
                      <span className="text-[11px] text-muted-foreground/70">
                        {item.source === "game" ? "En jeu" : "Site"} · {ago(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
