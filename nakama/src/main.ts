// Nakama server-side runtime for Tic-Tac-Toe
// Server-authoritative match handler with matchmaking, leaderboard, and timed mode

// ─── Types ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ID = 'tic_tac_toe_global';
const TICK_RATE = 5; // ticks per second
const TIMED_MODE_SECONDS = 30;

enum OpCode {
  MOVE = 1,
  STATE_UPDATE = 2,
  GAME_OVER = 3,
  MATCH_READY = 4,
  OPPONENT_LEFT = 5,
}

type Mark = 'X' | 'O';
type CellValue = Mark | null;
type Board = CellValue[];

interface PlayerData {
  presence: nkruntime.Presence;
  mark: Mark;
  nickname: string;
}

interface MatchState {
  board: Board;
  players: { [userId: string]: PlayerData };
  playerCount: number;
  currentTurnUserId: string;
  winner: string | null; // userId, 'draw', or null
  winLine: number[] | null;
  gameOver: boolean;
  mode: string; // 'classic' or 'timed'
  turnStartTick: number;
  turnDeadlineTick: number;
  emptyTicks: number;
}

const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Board): { winner: Mark | 'draw' | null; line: number[] | null } {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Mark, line: combo };
    }
  }
  if (board.every(cell => cell !== null)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

function buildStateMessage(state: MatchState): string {
  const players: { [userId: string]: { mark: string; nickname: string } } = {};
  for (const userId in state.players) {
    players[userId] = {
      mark: state.players[userId].mark,
      nickname: state.players[userId].nickname,
    };
  }

  return JSON.stringify({
    board: state.board,
    players,
    currentTurnUserId: state.currentTurnUserId,
    winner: state.winner,
    winLine: state.winLine,
    gameOver: state.gameOver,
    mode: state.mode,
    turnDeadlineSeconds: state.mode === 'timed' && !state.gameOver
      ? Math.max(0, Math.ceil((state.turnDeadlineTick - state.turnStartTick) / TICK_RATE))
      : null,
  });
}

// ─── Match Handler ────────────────────────────────────────────────────────────

const matchInit: nkruntime.MatchInitFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
): { state: nkruntime.MatchState; tickRate: number; label: string } {
  const mode = params['mode'] || 'classic';

  const state: MatchState = {
    board: Array(9).fill(null),
    players: {},
    playerCount: 0,
    currentTurnUserId: '',
    winner: null,
    winLine: null,
    gameOver: false,
    mode,
    turnStartTick: 0,
    turnDeadlineTick: 0,
    emptyTicks: 0,
  };

  const label = JSON.stringify({ mode, open: true, players: 0 });

  logger.info('Match created with mode: %s', mode);
  return { state, tickRate: TICK_RATE, label };
};

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: string }
): { state: nkruntime.MatchState; accept: boolean; rejectMessage?: string } {
  const s = state as MatchState;

  if (s.gameOver) {
    return { state: s, accept: false, rejectMessage: 'Game already over' };
  }
  if (s.playerCount >= 2) {
    return { state: s, accept: false, rejectMessage: 'Match is full' };
  }

  return { state: s, accept: true };
};

const matchJoin: nkruntime.MatchJoinFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;

  for (const presence of presences) {
    // Get user account for nickname
    let nickname = 'Player';
    try {
      const account = nk.accountGetId(presence.userId);
      nickname = account.user?.displayName || account.user?.username || 'Player';
    } catch (e) {
      logger.warn('Could not get account for user %s', presence.userId);
    }

    const mark: Mark = s.playerCount === 0 ? 'X' : 'O';
    s.players[presence.userId] = { presence, mark, nickname };
    s.playerCount++;

    logger.info('Player %s (%s) joined as %s', nickname, presence.userId, mark);
  }

  // If 2 players, start the game
  if (s.playerCount === 2) {
    // X always goes first - find who is X
    for (const userId in s.players) {
      if (s.players[userId].mark === 'X') {
        s.currentTurnUserId = userId;
        break;
      }
    }

    s.turnStartTick = tick;
    if (s.mode === 'timed') {
      s.turnDeadlineTick = tick + TIMED_MODE_SECONDS * TICK_RATE;
    }

    // Update label to closed
    const label = JSON.stringify({ mode: s.mode, open: false, players: 2 });
    dispatcher.matchLabelUpdate(label);

    // Broadcast match ready + initial state
    const allPresences = Object.values(s.players).map(p => p.presence);
    dispatcher.broadcastMessage(OpCode.MATCH_READY, buildStateMessage(s), allPresences, null, true);

    logger.info('Game started! Mode: %s', s.mode);
  }

  return { state: s };
};

const matchLeave: nkruntime.MatchLeaveFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;

  for (const presence of presences) {
    const player = s.players[presence.userId];
    if (!player) continue;

    logger.info('Player %s left', presence.userId);

    // If game is in progress, other player wins
    if (!s.gameOver && s.playerCount === 2) {
      // Find the remaining player
      const remainingUserId = Object.keys(s.players).find(id => id !== presence.userId);
      if (remainingUserId) {
        s.winner = remainingUserId;
        s.gameOver = true;

        // Update leaderboard
        updateLeaderboard(nk, logger, remainingUserId, presence.userId);

        // Notify remaining player
        const remaining = s.players[remainingUserId];
        dispatcher.broadcastMessage(
          OpCode.OPPONENT_LEFT,
          JSON.stringify({ winner: remainingUserId }),
          [remaining.presence],
          null,
          true
        );
      }
    }

    delete s.players[presence.userId];
    s.playerCount--;
  }

  // If no players, terminate
  if (s.playerCount === 0) {
    return null;
  }

  return { state: s };
};

const matchLoop: nkruntime.MatchLoopFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[]
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;

  // Auto-terminate empty matches
  if (s.playerCount === 0) {
    s.emptyTicks++;
    if (s.emptyTicks > TICK_RATE * 30) return null; // 30 seconds
    return { state: s };
  }
  s.emptyTicks = 0;

  // Game not started yet (waiting for 2nd player)
  if (s.playerCount < 2 || s.gameOver) {
    // Auto-terminate finished games after 60 seconds
    if (s.gameOver) {
      s.emptyTicks++;
      if (s.emptyTicks > TICK_RATE * 60) return null;
    }
    return { state: s };
  }

  // Check timer for timed mode
  if (s.mode === 'timed' && tick >= s.turnDeadlineTick) {
    // Current player timed out - other player wins
    const timedOutUserId = s.currentTurnUserId;
    const winnerUserId = Object.keys(s.players).find(id => id !== timedOutUserId);

    if (winnerUserId) {
      s.winner = winnerUserId;
      s.gameOver = true;

      updateLeaderboard(nk, logger, winnerUserId, timedOutUserId);

      const allPresences = Object.values(s.players).map(p => p.presence);
      dispatcher.broadcastMessage(
        OpCode.GAME_OVER,
        JSON.stringify({
          winner: winnerUserId,
          reason: 'timeout',
          board: s.board,
          winLine: null,
        }),
        allPresences,
        null,
        true
      );

      logger.info('Player %s timed out. Winner: %s', timedOutUserId, winnerUserId);
    }

    return { state: s };
  }

  // Process move messages
  for (const message of messages) {
    if (message.opCode !== OpCode.MOVE) continue;

    const senderId = message.sender.userId;

    // Validate it's this player's turn
    if (senderId !== s.currentTurnUserId) {
      logger.warn('Player %s tried to move out of turn', senderId);
      continue;
    }

    let data: { position: number };
    try {
      data = JSON.parse(nk.binaryToString(message.data));
    } catch (e) {
      logger.warn('Invalid move data from %s', senderId);
      continue;
    }

    const pos = data.position;

    // Validate position
    if (pos < 0 || pos > 8 || !Number.isInteger(pos)) {
      logger.warn('Invalid position %d from %s', pos, senderId);
      continue;
    }

    // Validate cell is empty
    if (s.board[pos] !== null) {
      logger.warn('Cell %d already occupied, move from %s rejected', pos, senderId);
      continue;
    }

    // Apply move
    const playerMark = s.players[senderId].mark;
    s.board[pos] = playerMark;

    logger.info('Player %s (%s) placed at position %d', senderId, playerMark, pos);

    // Check for winner
    const result = checkWinner(s.board);

    if (result.winner) {
      s.winLine = result.line;
      s.gameOver = true;

      if (result.winner === 'draw') {
        s.winner = 'draw';
        // Update leaderboard for draw
        const playerIds = Object.keys(s.players);
        updateLeaderboardDraw(nk, logger, playerIds[0], playerIds[1]);
      } else {
        // Find winner userId by mark
        const winnerUserId = Object.keys(s.players).find(
          id => s.players[id].mark === result.winner
        )!;
        const loserUserId = Object.keys(s.players).find(
          id => s.players[id].mark !== result.winner
        )!;
        s.winner = winnerUserId;

        updateLeaderboard(nk, logger, winnerUserId, loserUserId);
      }

      const allPresences = Object.values(s.players).map(p => p.presence);
      dispatcher.broadcastMessage(
        OpCode.GAME_OVER,
        JSON.stringify({
          winner: s.winner,
          reason: result.winner === 'draw' ? 'draw' : 'win',
          board: s.board,
          winLine: s.winLine,
        }),
        allPresences,
        null,
        true
      );

      logger.info('Game over! Winner: %s', s.winner);
      return { state: s };
    }

    // Switch turns
    const nextUserId = Object.keys(s.players).find(id => id !== senderId)!;
    s.currentTurnUserId = nextUserId;
    s.turnStartTick = tick;
    if (s.mode === 'timed') {
      s.turnDeadlineTick = tick + TIMED_MODE_SECONDS * TICK_RATE;
    }

    // Broadcast updated state
    const allPresences = Object.values(s.players).map(p => p.presence);
    dispatcher.broadcastMessage(OpCode.STATE_UPDATE, buildStateMessage(s), allPresences, null, true);
  }

  // Periodically broadcast time remaining for timed mode (every second)
  if (s.mode === 'timed' && tick % TICK_RATE === 0 && !s.gameOver) {
    const timeLeft = Math.max(0, Math.ceil((s.turnDeadlineTick - tick) / TICK_RATE));
    const allPresences = Object.values(s.players).map(p => p.presence);
    dispatcher.broadcastMessage(
      OpCode.STATE_UPDATE,
      JSON.stringify({
        board: s.board,
        players: Object.fromEntries(
          Object.entries(s.players).map(([id, p]) => [id, { mark: p.mark, nickname: p.nickname }])
        ),
        currentTurnUserId: s.currentTurnUserId,
        winner: s.winner,
        winLine: s.winLine,
        gameOver: s.gameOver,
        mode: s.mode,
        turnDeadlineSeconds: timeLeft,
      }),
      allPresences,
      null,
      true
    );
  }

  return { state: s };
};

const matchSignal: nkruntime.MatchSignalFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  data: string
): { state: nkruntime.MatchState; data?: string } | null {
  return { state };
};

const matchTerminate: nkruntime.MatchTerminateFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  graceSeconds: number
): { state: nkruntime.MatchState } | null {
  return { state };
};

// ─── Leaderboard Helpers ──────────────────────────────────────────────────────

function updateLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  winnerId: string,
  loserId: string
) {
  try {
    // Winner gets +200 points
    nk.leaderboardRecordWrite(LEADERBOARD_ID, winnerId, '', 200, 0, {});
    // Loser gets +0 (we can't subtract in Nakama incr leaderboard, so we track via storage)
    // Instead, use storage for detailed stats and leaderboard for ranking
    updatePlayerStats(nk, logger, winnerId, 'win');
    updatePlayerStats(nk, logger, loserId, 'loss');
  } catch (e) {
    logger.error('Failed to update leaderboard: %s', e);
  }
}

function updateLeaderboardDraw(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  player1Id: string,
  player2Id: string
) {
  try {
    nk.leaderboardRecordWrite(LEADERBOARD_ID, player1Id, '', 25, 0, {});
    nk.leaderboardRecordWrite(LEADERBOARD_ID, player2Id, '', 25, 0, {});
    updatePlayerStats(nk, logger, player1Id, 'draw');
    updatePlayerStats(nk, logger, player2Id, 'draw');
  } catch (e) {
    logger.error('Failed to update leaderboard for draw: %s', e);
  }
}

function updatePlayerStats(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  result: 'win' | 'loss' | 'draw'
) {
  const collection = 'player_stats';
  const key = 'stats';

  let stats = { wins: 0, losses: 0, draws: 0, streak: 0, score: 0 };

  try {
    const records = nk.storageRead([{ collection, key, userId }]);
    if (records.length > 0 && records[0].value) {
      stats = records[0].value as typeof stats;
    }
  } catch (e) {
    // First time, use defaults
  }

  if (result === 'win') {
    stats.wins++;
    stats.streak++;
    stats.score += 200;
  } else if (result === 'loss') {
    stats.losses++;
    stats.streak = 0;
    stats.score = Math.max(0, stats.score - 50);
  } else {
    stats.draws++;
    stats.streak = 0;
    stats.score += 25;
  }

  try {
    nk.storageWrite([{
      collection,
      key,
      userId,
      value: stats,
      permissionRead: 2, // public read
      permissionWrite: 0, // server only write
    }]);
  } catch (e) {
    logger.error('Failed to write player stats for %s: %s', userId, e);
  }
}

// ─── RPC Functions ────────────────────────────────────────────────────────────

function rpcGetPlayerStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = ctx.userId!;

  try {
    const records = nk.storageRead([{
      collection: 'player_stats',
      key: 'stats',
      userId,
    }]);

    if (records.length > 0) {
      return JSON.stringify(records[0].value);
    }
  } catch (e) {
    logger.error('Failed to get stats for %s: %s', userId, e);
  }

  return JSON.stringify({ wins: 0, losses: 0, draws: 0, streak: 0, score: 0 });
}

function rpcGetLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    const records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 20, undefined, 0);
    const results = (records.records || []).map(r => {
      // Get player stats
      let stats = { wins: 0, losses: 0, draws: 0, streak: 0, score: 0 };
      try {
        const statRecords = nk.storageRead([{
          collection: 'player_stats',
          key: 'stats',
          userId: r.ownerId,
        }]);
        if (statRecords.length > 0) {
          stats = statRecords[0].value as typeof stats;
        }
      } catch (e) {
        // Use defaults
      }

      return {
        userId: r.ownerId,
        nickname: r.username || 'Unknown',
        score: Number(r.score),
        rank: Number(r.rank),
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        streak: stats.streak,
      };
    });

    return JSON.stringify({ records: results });
  } catch (e) {
    logger.error('Failed to get leaderboard: %s', e);
    return JSON.stringify({ records: [] });
  }
}

function rpcFindMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let mode = 'classic';
  try {
    const data = JSON.parse(payload);
    mode = data.mode || 'classic';
  } catch (e) {
    // use default
  }

  // Try to find an open match with the same mode
  const limit = 10;
  const isAuthoritative = true;
  const label = '';
  const minSize = 0;
  const maxSize = 1; // Only matches with 0-1 players

  try {
    const matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, `+label.mode:${mode} +label.open:true`);

    if (matches.length > 0) {
      // Join existing match
      return JSON.stringify({ matchId: matches[0].matchId });
    }
  } catch (e) {
    logger.warn('Match list failed: %s', e);
  }

  // Create new match
  const matchId = nk.matchCreate('tic-tac-toe', { mode });
  return JSON.stringify({ matchId });
}

// ─── Init Module ──────────────────────────────────────────────────────────────

const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info('Tic-Tac-Toe module loaded');

  // Create leaderboard
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,
      false,     // not authoritative only
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      undefined, // no reset schedule
      undefined  // no metadata
    );
    logger.info('Leaderboard created: %s', LEADERBOARD_ID);
  } catch (e) {
    logger.info('Leaderboard already exists or error: %s', e);
  }

  // Register match handler
  initializer.registerMatch('tic-tac-toe', {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchSignal,
    matchTerminate,
  });

  // Register RPCs
  initializer.registerRpc('find_match', rpcFindMatch);
  initializer.registerRpc('get_player_stats', rpcGetPlayerStats);
  initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);

  // Register matchmaker matched hook - creates authoritative match when 2 players found
  initializer.registerMatchmakerMatched(function (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    matches: nkruntime.MatchmakerResult[]
  ): string | void {
    if (matches.length < 2) return;

    // Get mode from first player's string properties
    const props = matches[0].properties?.string_properties as unknown as { [key: string]: string } | undefined;
    const mode = props?.mode || 'classic';
    const matchId = nk.matchCreate('tic-tac-toe', { mode });
    logger.info('Matchmaker created match %s for %d players, mode: %s', matchId, matches.length, mode);
    return matchId;
  });

  logger.info('Tic-Tac-Toe server initialized successfully');
};

// This must be at the top level for Nakama to find it
!InitModule && InitModule;
