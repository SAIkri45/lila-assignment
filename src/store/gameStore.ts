import { create } from 'zustand';
import { nakamaClient, OpCode, type NakamaMatchState } from '@/lib/nakama';

export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type Board = CellValue[];
export type GameMode = 'classic' | 'timed';
export type GameStatus = 'waiting' | 'matchmaking' | 'playing' | 'finished';

export interface PlayerInfo {
  id: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  streak: number;
}

export interface GameState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | 'draw' | null;
  winLine: number[] | null;
  mode: GameMode;
  playerX: PlayerInfo | null;
  playerO: PlayerInfo | null;
  localPlayer: Player | null;
  timeLeft: number;
  timerDuration: number;
  nickname: string;
  leaderboard: PlayerInfo[];
  connected: boolean;
  matchId: string | null;
  localUserId: string | null;
  isOffline: boolean;

  setNickname: (name: string) => void;
  startMatchmaking: (mode: GameMode) => void;
  makeMove: (index: number) => void;
  resetGame: () => void;
  goToMenu: () => void;
  tick: () => void;
  fetchLeaderboard: () => void;
}

const EMPTY_BOARD: Board = Array(9).fill(null);

const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Board): { winner: Player | 'draw' | null; line: number[] | null } {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, line: combo };
    }
  }
  if (board.every(cell => cell !== null)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

// ─── Offline / Fallback helpers ───────────────────────────────────────────────

const generateId = () => Math.random().toString(36).slice(2, 8);
const MOCK_NAMES = ['Nova', 'Blaze', 'Echo', 'Viper', 'Raze', 'Sage', 'Jett', 'Omen', 'Cypher', 'Sova'];

function createMockOpponent(): PlayerInfo {
  const name = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
  const wins = Math.floor(Math.random() * 20);
  const losses = Math.floor(Math.random() * 15);
  const draws = Math.floor(Math.random() * 5);
  return {
    id: generateId(), nickname: name, wins, losses, draws,
    score: wins * 200 - losses * 50 + draws * 25,
    streak: Math.floor(Math.random() * 5),
  };
}

function getInitialLeaderboard(): PlayerInfo[] {
  const stored = localStorage.getItem('ttt-leaderboard');
  if (stored) return JSON.parse(stored);
  const defaults = MOCK_NAMES.slice(0, 6).map(name => {
    const wins = Math.floor(Math.random() * 30) + 5;
    const losses = Math.floor(Math.random() * 20);
    const draws = Math.floor(Math.random() * 8);
    return {
      id: generateId(), nickname: name, wins, losses, draws,
      score: wins * 200 - losses * 50 + draws * 25,
      streak: Math.floor(Math.random() * 8),
    };
  });
  return defaults.sort((a, b) => b.score - a.score);
}

function saveLeaderboard(lb: PlayerInfo[]) {
  localStorage.setItem('ttt-leaderboard', JSON.stringify(lb));
}

function findWinningMove(board: Board, mark: Player): number {
  for (const [a, b, c] of WIN_COMBOS) {
    const cells = [board[a], board[b], board[c]];
    const markCount = cells.filter(c => c === mark).length;
    const nullCount = cells.filter(c => c === null).length;
    if (markCount === 2 && nullCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  return -1;
}

function offlineUpdateLeaderboard(state: GameState) {
  const { winner, localPlayer, playerX, playerO, leaderboard } = state;
  if (!playerX || !playerO || !localPlayer) return;

  const localInfo = localPlayer === 'X' ? playerX : playerO;
  const opponentInfo = localPlayer === 'X' ? playerO : playerX;

  const updatedLocal = { ...localInfo };
  const updatedOpponent = { ...opponentInfo };

  if (winner === 'draw') {
    updatedLocal.draws++; updatedOpponent.draws++;
    updatedLocal.score += 25; updatedOpponent.score += 25;
    updatedLocal.streak = 0; updatedOpponent.streak = 0;
  } else if (winner === localPlayer) {
    updatedLocal.wins++; updatedLocal.score += 200; updatedLocal.streak++;
    updatedOpponent.losses++; updatedOpponent.score = Math.max(0, updatedOpponent.score - 50); updatedOpponent.streak = 0;
  } else {
    updatedLocal.losses++; updatedLocal.score = Math.max(0, updatedLocal.score - 50); updatedLocal.streak = 0;
    updatedOpponent.wins++; updatedOpponent.score += 200; updatedOpponent.streak++;
  }

  const newLb = [...leaderboard];
  const upsert = (p: PlayerInfo) => {
    const idx = newLb.findIndex(x => x.nickname === p.nickname);
    if (idx >= 0) newLb[idx] = p; else newLb.push(p);
  };
  upsert(updatedLocal);
  upsert(updatedOpponent);
  newLb.sort((a, b) => b.score - a.score);

  saveLeaderboard(newLb);
  useGameStore.setState({
    leaderboard: newLb,
    playerX: localPlayer === 'X' ? updatedLocal : updatedOpponent,
    playerO: localPlayer === 'O' ? updatedLocal : updatedOpponent,
  });
}

function offlineMakeAIMove() {
  const s = useGameStore.getState();
  if (s.status !== 'playing' || s.winner) return;
  const empty = s.board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
  if (empty.length === 0) return;

  const aiMark = s.currentPlayer;
  const oppMark: Player = aiMark === 'X' ? 'O' : 'X';

  let move = findWinningMove(s.board, aiMark);
  if (move === -1) move = findWinningMove(s.board, oppMark);
  if (move === -1) {
    if (s.board[4] === null) move = 4;
    else move = empty[Math.floor(Math.random() * empty.length)];
  }

  const aiBoard = [...s.board];
  aiBoard[move] = aiMark;
  const result = checkWinner(aiBoard);

  if (result.winner) {
    useGameStore.setState({ board: aiBoard, winner: result.winner, winLine: result.line, status: 'finished', currentPlayer: aiMark });
    offlineUpdateLeaderboard(useGameStore.getState());
  } else {
    const returnPlayer: Player = aiMark === 'X' ? 'O' : 'X';
    useGameStore.setState({ board: aiBoard, currentPlayer: returnPlayer, timeLeft: s.mode === 'timed' ? 30 : 30 });
  }
}

// ─── Nakama online handlers ──────────────────────────────────────────────────

function setupNakamaHandlers() {
  nakamaClient.onMatchData = (opCode: number, rawData: string) => {
    let data: any;
    try { data = JSON.parse(rawData); } catch (e) { return; }

    const state = useGameStore.getState();

    switch (opCode) {
      case OpCode.MATCH_READY:
      case OpCode.STATE_UPDATE: {
        applyServerState(data as NakamaMatchState, state);
        break;
      }
      case OpCode.GAME_OVER: {
        const localUserId = nakamaClient.getUserId();
        const winner = data.winner;
        const winLine = data.winLine || null;
        const board = (data.board || state.board).map((c: string | null) =>
          c === 'X' || c === 'O' ? c : null
        ) as Board;

        let winnerMark: Player | 'draw' | null = null;
        if (winner === 'draw' || data.reason === 'draw') {
          winnerMark = 'draw';
        } else if (winner === localUserId) {
          winnerMark = state.localPlayer!;
        } else {
          winnerMark = state.localPlayer === 'X' ? 'O' : 'X';
        }

        useGameStore.setState({ board, winner: winnerMark, winLine, status: 'finished' });
        setTimeout(() => useGameStore.getState().fetchLeaderboard(), 1000);
        break;
      }
      case OpCode.OPPONENT_LEFT: {
        const localUserId = nakamaClient.getUserId();
        if (data.winner === localUserId) {
          useGameStore.setState({ winner: state.localPlayer!, status: 'finished' });
        }
        setTimeout(() => useGameStore.getState().fetchLeaderboard(), 1000);
        break;
      }
    }
  };

  nakamaClient.onDisconnect = () => {
    const state = useGameStore.getState();
    if (state.status === 'playing' || state.status === 'matchmaking') {
      useGameStore.setState({ status: 'waiting', connected: false });
    }
  };

  nakamaClient.onError = (error) => {
    console.error('Nakama error:', error);
  };
}

function applyServerState(matchState: NakamaMatchState, currentState: GameState) {
  const localUserId = nakamaClient.getUserId();
  if (!localUserId) return;

  const board = matchState.board.map((c) =>
    c === 'X' || c === 'O' ? (c as Player) : null
  ) as Board;

  let localMark: Player | null = null;
  const playerInfoMap = matchState.players || {};

  for (const userId in playerInfoMap) {
    if (userId === localUserId) localMark = playerInfoMap[userId].mark as Player;
  }

  let playerX: PlayerInfo | null = null;
  let playerO: PlayerInfo | null = null;

  for (const userId in playerInfoMap) {
    const p = playerInfoMap[userId];
    const info: PlayerInfo = { id: userId, nickname: p.nickname, wins: 0, losses: 0, draws: 0, score: 0, streak: 0 };
    if (p.mark === 'X') {
      playerX = currentState.playerX?.id === userId ? { ...currentState.playerX, nickname: p.nickname } : info;
    } else {
      playerO = currentState.playerO?.id === userId ? { ...currentState.playerO, nickname: p.nickname } : info;
    }
  }

  const currentTurnMark = playerInfoMap[matchState.currentTurnUserId]?.mark as Player || 'X';
  const timeLeft = matchState.turnDeadlineSeconds ?? currentState.timeLeft;

  useGameStore.setState({
    board, currentPlayer: currentTurnMark, localPlayer: localMark,
    playerX, playerO, status: 'playing', winner: null, winLine: null,
    mode: (matchState.mode || 'classic') as GameMode,
    timeLeft: typeof timeLeft === 'number' ? timeLeft : 30,
    localUserId,
  });
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>((set, get) => ({
  board: [...EMPTY_BOARD],
  currentPlayer: 'X',
  status: 'waiting',
  winner: null,
  winLine: null,
  mode: 'classic',
  playerX: null,
  playerO: null,
  localPlayer: null,
  timeLeft: 30,
  timerDuration: 30,
  nickname: localStorage.getItem('ttt-nickname') || '',
  leaderboard: getInitialLeaderboard(),
  connected: false,
  matchId: null,
  localUserId: null,
  isOffline: false,

  setNickname: (name) => {
    localStorage.setItem('ttt-nickname', name);
    set({ nickname: name });
  },

  startMatchmaking: async (mode) => {
    const { nickname } = get();
    set({ status: 'matchmaking', mode });

    // Try Nakama first
    try {
      if (!nakamaClient.isConnected()) {
        await nakamaClient.authenticate(nickname || 'Player');
        await nakamaClient.connectSocket();
        setupNakamaHandlers();
        set({ connected: true, localUserId: nakamaClient.getUserId(), isOffline: false });
      }

      const matchId = await nakamaClient.findMatch(mode);
      set({ matchId });
      // Server broadcasts MATCH_READY when 2nd player joins
      return;
    } catch (error) {
      console.warn('Nakama unavailable, falling back to offline mode:', error);
    }

    // ─── Offline fallback ───────────────────────────────────────────────
    set({ isOffline: true, connected: false });

    setTimeout(() => {
      const localMark: Player = Math.random() > 0.5 ? 'X' : 'O';
      const localPlayerInfo: PlayerInfo = {
        id: generateId(), nickname: nickname || 'You',
        wins: 0, losses: 0, draws: 0, score: 0, streak: 0,
      };
      const lb = get().leaderboard;
      const existing = lb.find(p => p.nickname === localPlayerInfo.nickname);
      if (existing) Object.assign(localPlayerInfo, existing);

      const opponent = createMockOpponent();

      set({
        status: 'playing',
        board: [...EMPTY_BOARD],
        currentPlayer: 'X',
        winner: null,
        winLine: null,
        localPlayer: localMark,
        playerX: localMark === 'X' ? localPlayerInfo : opponent,
        playerO: localMark === 'O' ? localPlayerInfo : opponent,
        timeLeft: 30,
      });

      // If AI goes first (local player is O), trigger AI move
      if (localMark === 'O') {
        setTimeout(() => offlineMakeAIMove(), 600 + Math.random() * 800);
      }
    }, 1500 + Math.random() * 1500);
  },

  makeMove: async (index) => {
    const { board, currentPlayer, status, localPlayer, winner, isOffline, mode } = get();
    if (status !== 'playing' || winner || board[index]) return;
    if (currentPlayer !== localPlayer) return;

    if (!isOffline) {
      // Online: send to Nakama server
      try {
        await nakamaClient.sendMove(index);
      } catch (error) {
        console.error('Failed to send move:', error);
      }
      return;
    }

    // ─── Offline move logic ─────────────────────────────────────────────
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    const result = checkWinner(newBoard);

    if (result.winner) {
      set({ board: newBoard, winner: result.winner, winLine: result.line, status: 'finished' });
      offlineUpdateLeaderboard(useGameStore.getState());
    } else {
      const nextPlayer: Player = currentPlayer === 'X' ? 'O' : 'X';
      set({ board: newBoard, currentPlayer: nextPlayer, timeLeft: mode === 'timed' ? 30 : 30 });

      // AI opponent moves
      if (nextPlayer !== localPlayer) {
        setTimeout(() => offlineMakeAIMove(), 600 + Math.random() * 800);
      }
    }
  },

  tick: () => {
    const { status, winner, mode, timeLeft, isOffline, currentPlayer, localPlayer } = get();
    if (mode !== 'timed' || status !== 'playing' || winner) return;

    if (timeLeft <= 1) {
      if (isOffline) {
        // Timeout - current player loses
        const winnerMark: Player = currentPlayer === 'X' ? 'O' : 'X';
        set({ winner: winnerMark, status: 'finished', timeLeft: 0 });
        offlineUpdateLeaderboard(useGameStore.getState());
      }
      // Online: server handles timeout
    } else {
      set({ timeLeft: timeLeft - 1 });
    }
  },

  resetGame: async () => {
    const { mode, isOffline } = get();
    if (!isOffline) {
      await nakamaClient.leaveMatch();
    }
    set({ board: [...EMPTY_BOARD], winner: null, winLine: null, matchId: null });
    get().startMatchmaking(mode);
  },

  goToMenu: async () => {
    const { isOffline } = get();
    if (!isOffline) {
      await nakamaClient.leaveMatch();
      await nakamaClient.removeMatchmaker();
    }
    set({
      status: 'waiting', winner: null, board: [...EMPTY_BOARD],
      winLine: null, matchId: null,
    });
    get().fetchLeaderboard();
  },

  fetchLeaderboard: async () => {
    const { isOffline } = get();
    if (isOffline || !nakamaClient.isConnected()) return;

    try {
      const entries = await nakamaClient.getLeaderboard();
      const leaderboard: PlayerInfo[] = entries.map((e) => ({
        id: e.userId, nickname: e.nickname,
        wins: e.wins, losses: e.losses, draws: e.draws,
        score: e.score, streak: e.streak,
      }));
      set({ leaderboard });
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    }
  },
}));
