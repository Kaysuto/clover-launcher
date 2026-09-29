import { useEffect, useState } from "react";

export type RecentVote = { player: string; votedAt: string };

const ROTATION_MS = 4000;

/**
 * Derniers votes pour le serveur, un à la fois, comme les annonces en jeu. Un clic ouvre la page
 * de vote du site. Immobile si le système demande moins d'animations.
 */
export function VoteTicker({ votes, onVote }: { votes: RecentVote[]; onVote: () => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (votes.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % votes.length), ROTATION_MS);
    return () => clearInterval(timer);
  }, [votes.length]);

  if (votes.length === 0) return null;
  const vote = votes[index % votes.length];

  return (
    <button
      type="button"
      onClick={onVote}
      title="Voter pour Clover Games"
      className="flex h-8 max-w-[300px] min-w-0 items-center gap-2 overflow-hidden rounded-full bg-[#2a251d]/85 py-1 pr-3.5 pl-1 text-[12px] transition-colors hover:bg-[#35302a]"
    >
      <img
        key={`${vote.player}-head`}
        src={`https://minotar.net/helm/${encodeURIComponent(vote.player)}/48.png`}
        alt=""
        width={24}
        height={24}
        className="pixelated size-6 shrink-0 rounded-full animate-in fade-in"
      />
      <span key={vote.player} className="truncate animate-in fade-in slide-in-from-bottom-1.5 duration-300">
        <span className="font-bold">{vote.player}</span> <span className="text-[#cfc8b8]">a voté pour le serveur</span>
      </span>
    </button>
  );
}
