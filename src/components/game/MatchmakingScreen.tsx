import { useGameStore } from '@/store/gameStore';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MatchmakingScreen = () => {
  const { goToMenu } = useGameStore();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up text-center">
        <div className="rounded-xl border border-border bg-card p-8 card-glow">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">
            Finding a random player...
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Waiting for an opponent to join
          </p>
          <Button
            variant="outline"
            onClick={goToMenu}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MatchmakingScreen;
