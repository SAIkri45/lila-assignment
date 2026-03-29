import { useState } from 'react';
import { useGameStore, type GameMode } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const NicknameScreen = () => {
  const { nickname, setNickname, startMatchmaking } = useGameStore();
  const [name, setName] = useState(nickname);
  const [mode, setMode] = useState<GameMode>('classic');

  const handleContinue = () => {
    if (!name.trim()) return;
    setNickname(name.trim());
    startMatchmaking(mode);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="rounded-xl border border-border bg-card p-8 card-glow">
          <h2 className="mb-2 text-center text-2xl font-bold text-foreground">
            Who are you?
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Enter your nickname to start playing
          </p>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Nickname
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your nickname..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              maxLength={12}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            />
          </div>

          <div className="mb-6">
            <label className="mb-3 block text-sm font-medium text-muted-foreground">
              Game Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('classic')}
                className={`rounded-lg border-2 p-3 text-center text-sm font-semibold transition-all ${
                  mode === 'classic'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-secondary text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                ♟ Classic
              </button>
              <button
                onClick={() => setMode('timed')}
                className={`rounded-lg border-2 p-3 text-center text-sm font-semibold transition-all ${
                  mode === 'timed'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-secondary text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                ⏱ Timed (30s)
              </button>
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={!name.trim()}
            className="w-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NicknameScreen;
