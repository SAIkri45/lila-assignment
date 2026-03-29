import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';

const XMark = ({ glow }: { glow?: boolean }) => (
  <svg viewBox="0 0 100 100" className={`h-full w-full ${glow ? 'x-glow' : ''}`}>
    <line x1="20" y1="20" x2="80" y2="80" stroke="hsl(var(--x-color))" strokeWidth="12" strokeLinecap="round" />
    <line x1="80" y1="20" x2="20" y2="80" stroke="hsl(var(--x-color))" strokeWidth="12" strokeLinecap="round" />
  </svg>
);

const OMark = ({ glow }: { glow?: boolean }) => (
  <svg viewBox="0 0 100 100" className={`h-full w-full ${glow ? 'o-glow' : ''}`}>
    <circle cx="50" cy="50" r="30" fill="none" stroke="hsl(var(--o-color))" strokeWidth="12" strokeLinecap="round" />
  </svg>
);

const GameBoard = () => {
  const {
    board, currentPlayer, winner, winLine, localPlayer,
    playerX, playerO, mode, timeLeft, status,
    makeMove, resetGame, goToMenu, tick,
  } = useGameStore();

  useEffect(() => {
    if (mode !== 'timed' || status !== 'playing' || winner) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [mode, status, winner, tick]);

  const isMyTurn = currentPlayer === localPlayer && !winner;
  const localInfo = localPlayer === 'X' ? playerX : playerO;
  const opponentInfo = localPlayer === 'X' ? playerO : playerX;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      {/* Player labels */}
      <div className="flex w-full max-w-xs items-center justify-between">
        <div className={`rounded-lg px-4 py-2 text-center text-sm font-bold transition-all ${
          currentPlayer === localPlayer
            ? 'bg-primary text-primary-foreground animate-pulse-glow'
            : 'bg-secondary text-muted-foreground'
        }`}>
          <span className="text-xs uppercase tracking-wide">
            {localInfo?.nickname || 'You'}
          </span>
          <div className="text-xs opacity-70">(you)</div>
        </div>

        <div className="flex flex-col items-center">
          {mode === 'timed' && !winner && (
            <div className={`font-mono text-2xl font-bold ${
              timeLeft <= 10 ? 'text-destructive' : 'text-foreground'
            }`}>
              {timeLeft}s
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {winner
              ? winner === 'draw' ? 'DRAW' : ''
              : isMyTurn ? 'Your turn' : "Opponent's turn"
            }
          </div>
        </div>

        <div className={`rounded-lg px-4 py-2 text-center text-sm font-bold transition-all ${
          currentPlayer !== localPlayer
            ? 'bg-accent text-accent-foreground'
            : 'bg-secondary text-muted-foreground'
        }`}>
          <span className="text-xs uppercase tracking-wide">
            {opponentInfo?.nickname || 'Opponent'}
          </span>
          <div className="text-xs opacity-70">(opp)</div>
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 card-glow">
        {board.map((cell, i) => {
          const isWinCell = winLine?.includes(i);
          return (
            <button
              key={i}
              onClick={() => makeMove(i)}
              disabled={!!cell || !!winner || !isMyTurn}
              className={`flex h-24 w-24 items-center justify-center rounded-lg border transition-all sm:h-28 sm:w-28 ${
                isWinCell
                  ? 'border-primary bg-primary/10'
                  : cell
                  ? 'border-border bg-secondary'
                  : 'border-border bg-muted/50 hover:bg-secondary hover:border-primary/50 cursor-pointer'
              } ${!cell && isMyTurn && !winner ? 'hover:scale-105' : ''}`}
            >
              <div className={`h-14 w-14 sm:h-16 sm:w-16 ${cell ? 'animate-mark-pop' : ''}`}>
                {cell === 'X' && <XMark glow={isWinCell} />}
                {cell === 'O' && <OMark glow={isWinCell} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Result overlay */}
      {winner && (
        <div className="animate-slide-up text-center">
          <div className="mb-2">
            {winner === 'draw' ? (
              <p className="text-xl font-bold text-muted-foreground">It's a Draw!</p>
            ) : winner === localPlayer ? (
              <div>
                <div className="mx-auto mb-2 h-16 w-16">
                  {winner === 'X' ? <XMark glow /> : <OMark glow />}
                </div>
                <p className="text-2xl font-bold text-primary text-glow">WINNER!</p>
                <p className="text-lg font-semibold text-success">+200 pts</p>
              </div>
            ) : (
              <div>
                <div className="mx-auto mb-2 h-16 w-16">
                  {winner === 'X' ? <XMark /> : <OMark />}
                </div>
                <p className="text-xl font-bold text-destructive">You Lost</p>
                <p className="text-sm text-muted-foreground">-50 pts</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button onClick={resetGame} className="bg-primary text-primary-foreground font-semibold">
              Play Again
            </Button>
            <Button variant="outline" onClick={goToMenu} className="border-border text-muted-foreground">
              Menu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;
