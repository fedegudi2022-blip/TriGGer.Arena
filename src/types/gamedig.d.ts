declare module 'gamedig' {
  interface Player {
    name?: string;
    raw?: Record<string, unknown>;
  }
  type GameType =
    | 'counterstrike16'
    | 'counterstrike2'
    | 'csgo'
    | 'tf2'
    | 'minecraft'
    | 'rust'
    | 'valheim'
    | (string & {});

  interface QueryResult {
    name: string;
    map: string;
    password: boolean;
    maxplayers: number;
    players: Player[];
    bots: Player[];
    connect: string;
    ping: number;
    raw?: Record<string, unknown>;
  }

  interface QueryOptions {
    type: GameType;
    host: string;
    port?: number;
    socketTimeout?: number;
    attemptTimeout?: number;
    maxAttempts?: number;
  }

  class GameDig {
    static query(options: QueryOptions): Promise<QueryResult>;
  }

  export { GameDig, GameType, Player, QueryOptions, QueryResult };
}