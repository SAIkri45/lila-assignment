import { Client, Session, Socket } from '@heroiclabs/nakama-js';

// Nakama server configuration
const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || '127.0.0.1';
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || '7350';
const NAKAMA_KEY = import.meta.env.VITE_NAKAMA_KEY || 'defaultkey';
const NAKAMA_SSL = import.meta.env.VITE_NAKAMA_SSL === 'true';

// Op codes must match server
export enum OpCode {
  MOVE = 1,
  STATE_UPDATE = 2,
  GAME_OVER = 3,
  MATCH_READY = 4,
  OPPONENT_LEFT = 5,
}

export interface NakamaMatchState {
  board: (string | null)[];
  players: { [userId: string]: { mark: string; nickname: string } };
  currentTurnUserId: string;
  winner: string | null;
  winLine: number[] | null;
  gameOver: boolean;
  mode: string;
  turnDeadlineSeconds: number | null;
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  score: number;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
}

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  score: number;
}

class NakamaClient {
  private client: Client;
  private session: Session | null = null;
  private socket: Socket | null = null;
  private currentMatchId: string | null = null;
  private matchmakerTicket: string | null = null;

  // Callbacks
  onMatchData: ((opCode: number, data: string) => void) | null = null;
  onMatchPresence: ((joins: any[], leaves: any[]) => void) | null = null;
  onMatchmakerMatched: ((matchId: string, token: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onError: ((error: any) => void) | null = null;

  constructor() {
    this.client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_SSL);
  }

  async authenticate(nickname: string): Promise<Session> {
    // Use device ID authentication (generates a unique ID per browser)
    let deviceId = localStorage.getItem('nakama-device-id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nakama-device-id', deviceId);
    }

    this.session = await this.client.authenticateDevice(deviceId, true, nickname);

    // Update display name if changed
    if (this.session.username !== nickname) {
      await this.client.updateAccount(this.session, {
        display_name: nickname,
        username: nickname.toLowerCase().replace(/[^a-z0-9_]/g, '_') + '_' + deviceId.slice(0, 4),
      });
    }

    return this.session;
  }

  async connectSocket(): Promise<Socket> {
    if (!this.session) throw new Error('Must authenticate first');

    this.socket = this.client.createSocket(NAKAMA_SSL, false);
    await this.socket.connect(this.session, true);

    // Set up event handlers
    this.socket.onmatchdata = (matchData) => {
      const data = new TextDecoder().decode(matchData.data);
      this.onMatchData?.(matchData.op_code, data);
    };

    this.socket.onmatchpresence = (presenceEvent) => {
      this.onMatchPresence?.(presenceEvent.joins || [], presenceEvent.leaves || []);
    };

    this.socket.onmatchmakermatched = async (matched) => {
      // Join the matched game
      const matchId = matched.match_id;
      if (matchId) {
        try {
          await this.socket!.joinMatch(matchId);
          this.currentMatchId = matchId;
          this.matchmakerTicket = null;
          this.onMatchmakerMatched?.(matchId, matched.token || '');
        } catch (e) {
          this.onError?.(e);
        }
      }
    };

    this.socket.ondisconnect = () => {
      this.onDisconnect?.();
    };

    this.socket.onerror = (error) => {
      this.onError?.(error);
    };

    return this.socket;
  }

  async findMatch(mode: string): Promise<string> {
    if (!this.session || !this.socket) throw new Error('Not connected');

    // Use RPC to find or create a match
    const response = await this.client.rpc(this.session, 'find_match', JSON.stringify({ mode }));
    const result = JSON.parse(response.payload || '{}');
    const matchId = result.matchId;

    if (!matchId) throw new Error('Failed to find or create match');

    // Join the match
    await this.socket.joinMatch(matchId);
    this.currentMatchId = matchId;

    return matchId;
  }

  async addMatchmaker(mode: string): Promise<string> {
    if (!this.socket) throw new Error('Not connected');

    const ticket = await this.socket.addMatchmaker(
      `+properties.mode:${mode}`, // query
      2,  // min count
      2,  // max count
      { mode }, // string properties
      {}  // numeric properties
    );

    this.matchmakerTicket = ticket.ticket;
    return ticket.ticket;
  }

  async removeMatchmaker(): Promise<void> {
    if (!this.socket || !this.matchmakerTicket) return;
    try {
      await this.socket.removeMatchmaker(this.matchmakerTicket);
    } catch (e) {
      // Ignore errors when removing
    }
    this.matchmakerTicket = null;
  }

  async sendMove(position: number): Promise<void> {
    if (!this.socket || !this.currentMatchId) throw new Error('Not in a match');

    await this.socket.sendMatchState(
      this.currentMatchId,
      OpCode.MOVE,
      JSON.stringify({ position })
    );
  }

  async leaveMatch(): Promise<void> {
    if (!this.socket || !this.currentMatchId) return;
    try {
      await this.socket.leaveMatch(this.currentMatchId);
    } catch (e) {
      // Ignore
    }
    this.currentMatchId = null;
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!this.session) return [];
    try {
      const response = await this.client.rpc(this.session, 'get_leaderboard', '{}');
      const data = JSON.parse(response.payload || '{"records":[]}');
      return data.records || [];
    } catch (e) {
      console.error('Failed to get leaderboard:', e);
      return [];
    }
  }

  async getPlayerStats(): Promise<PlayerStats> {
    if (!this.session) return { wins: 0, losses: 0, draws: 0, streak: 0, score: 0 };
    try {
      const response = await this.client.rpc(this.session, 'get_player_stats', '{}');
      return JSON.parse(response.payload || '{"wins":0,"losses":0,"draws":0,"streak":0,"score":0}');
    } catch (e) {
      console.error('Failed to get player stats:', e);
      return { wins: 0, losses: 0, draws: 0, streak: 0, score: 0 };
    }
  }

  getUserId(): string | null {
    return this.session?.user_id || null;
  }

  getMatchId(): string | null {
    return this.currentMatchId;
  }

  isConnected(): boolean {
    return this.socket !== null && this.session !== null;
  }

  async disconnect(): Promise<void> {
    await this.removeMatchmaker();
    await this.leaveMatch();
    if (this.socket) {
      this.socket.disconnect(false);
      this.socket = null;
    }
    this.session = null;
  }
}

// Singleton instance
export const nakamaClient = new NakamaClient();
