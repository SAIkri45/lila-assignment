import { useGameStore } from '@/store/gameStore';
import { Trophy } from 'lucide-react';

const Leaderboard = () => {
  const { leaderboard, nickname } = useGameStore();
  const top10 = leaderboard.slice(0, 10);

  return (
    <div className="rounded-xl border border-border bg-card p-4 card-glow">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-accent" />
        <h3 className="text-base font-bold text-foreground">Leaderboard</h3>
      </div>
      <div className="space-y-0">
        <div className="grid grid-cols-[2rem_1fr_4rem_2.5rem_3.5rem] gap-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>#</span>
          <span>Player</span>
          <span>W/L/D</span>
          <span>🔥</span>
          <span className="text-right">Score</span>
        </div>
        {top10.map((player, i) => {
          const isYou = player.nickname === nickname;
          return (
            <div
              key={player.id}
              className={`grid grid-cols-[2rem_1fr_4rem_2.5rem_3.5rem] gap-1 rounded-md py-1.5 text-sm ${
                isYou ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
              }`}
            >
              <span className="text-muted-foreground">{i + 1}.</span>
              <span className="truncate">
                {player.nickname} {isYou && <span className="text-xs text-muted-foreground">(you)</span>}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {player.wins}/{player.losses}/{player.draws}
              </span>
              <span className="font-mono text-xs">{player.streak}</span>
              <span className="text-right font-mono font-semibold text-accent">
                {player.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
