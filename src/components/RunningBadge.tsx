import { cn } from "@/lib/utils";

/** Pastille « En jeu » de l'instance dont Minecraft est ouvert. */
export function RunningBadge({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent", className)}>
      <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
      En jeu
    </span>
  );
}
