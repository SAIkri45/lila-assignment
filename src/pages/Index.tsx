import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import NicknameScreen from '@/components/game/NicknameScreen';
import MatchmakingScreen from '@/components/game/MatchmakingScreen';
import GameBoard from '@/components/game/GameBoard';
import Leaderboard from '@/components/game/Leaderboard';

const Index = () => {
  const { status, fetchLeaderboard } = useGameStore();

  // Fetch leaderboard on mount
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (status === 'waiting') {
    return (
      <div className="min-h-screen">
        <NicknameScreen />
        <div className="mx-auto max-w-sm px-4 pb-8">
          <Leaderboard />
        </div>
      </div>
    );
  }

  if (status === 'matchmaking') {
    return <MatchmakingScreen />;
  }

  return (
    <div className="min-h-screen">
      <GameBoard />
      <div className="mx-auto max-w-sm px-4 pb-8">
        <Leaderboard />
      </div>
    </div>
  );
};

export default Index;
