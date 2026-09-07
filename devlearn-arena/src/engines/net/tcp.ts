/**
 * TCP の状態遷移。
 *
 * 出力を作り置きせず、送受信したセグメントから状態を進める。
 * 3ウェイハンドシェイク、順序どおりの終了、TIME_WAIT、再送を扱う。
 */
export type TcpState =
  | 'CLOSED'
  | 'LISTEN'
  | 'SYN_SENT'
  | 'SYN_RECEIVED'
  | 'ESTABLISHED'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSING'
  | 'TIME_WAIT'
  | 'CLOSE_WAIT'
  | 'LAST_ACK';

export type TcpFlag = 'SYN' | 'ACK' | 'FIN' | 'RST' | 'PSH';

export interface Segment {
  from: 'client' | 'server';
  flags: TcpFlag[];
  seq: number;
  ack: number;
  /** 運んだデータの長さ */
  length: number;
}

export interface Endpoint {
  state: TcpState;
  seq: number;
  ack: number;
}

export interface Connection {
  client: Endpoint;
  server: Endpoint;
  segments: Segment[];
  /** 経過 tick。TIME_WAIT の残り時間を測る */
  tick: number;
  /** TIME_WAIT に入った tick */
  timeWaitAt: number | null;
  /** 落とすと決めたセグメント（再送の学習用） */
  dropped: number[];
  /** 再送した回数 */
  retransmits: number;
}

/** TIME_WAIT の長さ（2MSL 相当）。実時間ではなく tick で数える */
export const TIME_WAIT_TICKS = 8;

export function openConnection(): Connection {
  return {
    client: { state: 'CLOSED', seq: 1000, ack: 0 },
    server: { state: 'LISTEN', seq: 5000, ack: 0 },
    segments: [],
    tick: 0,
    timeWaitAt: null,
    dropped: [],
    retransmits: 0,
  };
}

function record(connection: Connection, segment: Segment): Segment[] {
  return [...connection.segments, segment];
}

export interface StepResult {
  connection: Connection;
  /** 送ったセグメントの説明。届かなかった場合は理由付き */
  note: string;
  error: string | null;
}

/** 落とす指定に入っているセグメント番号か */
function isDropped(connection: Connection, index: number): boolean {
  return connection.dropped.includes(index);
}

/**
 * クライアント側から1手進める。
 * `connect` `send` `close` の3つと、時間を進める `tick` からなる。
 */
export function clientAction(
  connection: Connection,
  action: 'connect' | 'send' | 'close',
  options: { length?: number } = {},
): StepResult {
  const { client, server } = connection;

  if (action === 'connect') {
    if (client.state !== 'CLOSED') {
      return { connection, note: '', error: `connect できるのは CLOSED のときだけです（今は ${client.state}）` };
    }
    if (server.state !== 'LISTEN') {
      return { connection, note: '', error: '相手が待ち受けていません（RST が返ります）' };
    }
    const index = connection.segments.length;
    const syn: Segment = { from: 'client', flags: ['SYN'], seq: client.seq, ack: 0, length: 0 };

    if (isDropped(connection, index)) {
      return {
        connection: { ...connection, segments: record(connection, syn), client: { ...client, state: 'SYN_SENT' } },
        note: 'SYN を送ったが落ちた。応答が無いので再送する',
        error: null,
      };
    }

    const synAck: Segment = {
      from: 'server',
      flags: ['SYN', 'ACK'],
      seq: server.seq,
      ack: client.seq + 1,
      length: 0,
    };
    const ack: Segment = {
      from: 'client',
      flags: ['ACK'],
      seq: client.seq + 1,
      ack: server.seq + 1,
      length: 0,
    };
    return {
      connection: {
        ...connection,
        segments: [...connection.segments, syn, synAck, ack],
        client: { state: 'ESTABLISHED', seq: client.seq + 1, ack: server.seq + 1 },
        server: { state: 'ESTABLISHED', seq: server.seq + 1, ack: client.seq + 1 },
      },
      note: '3ウェイハンドシェイク完了（SYN → SYN+ACK → ACK）',
      error: null,
    };
  }

  if (action === 'send') {
    if (client.state !== 'ESTABLISHED') {
      return { connection, note: '', error: `データを送れるのは ESTABLISHED のときだけです（今は ${client.state}）` };
    }
    const length = options.length ?? 100;
    const index = connection.segments.length;
    const data: Segment = { from: 'client', flags: ['PSH', 'ACK'], seq: client.seq, ack: client.ack, length };

    if (isDropped(connection, index)) {
      return {
        connection: {
          ...connection,
          segments: record(connection, data),
          retransmits: connection.retransmits + 1,
        },
        note: 'データが落ちた。ACK が返らないので再送する',
        error: null,
      };
    }

    const ack: Segment = {
      from: 'server',
      flags: ['ACK'],
      seq: server.seq,
      ack: client.seq + length,
      length: 0,
    };
    return {
      connection: {
        ...connection,
        segments: [...connection.segments, data, ack],
        client: { ...client, seq: client.seq + length },
        server: { ...server, ack: client.seq + length },
      },
      note: `${String(length)} バイト送り、ACK を受け取った`,
      error: null,
    };
  }

  // close
  if (client.state !== 'ESTABLISHED') {
    return { connection, note: '', error: `close できるのは ESTABLISHED のときだけです（今は ${client.state}）` };
  }
  const fin: Segment = { from: 'client', flags: ['FIN', 'ACK'], seq: client.seq, ack: client.ack, length: 0 };
  const finAck: Segment = { from: 'server', flags: ['ACK'], seq: server.seq, ack: client.seq + 1, length: 0 };
  const serverFin: Segment = { from: 'server', flags: ['FIN', 'ACK'], seq: server.seq, ack: client.seq + 1, length: 0 };
  const lastAck: Segment = { from: 'client', flags: ['ACK'], seq: client.seq + 1, ack: server.seq + 1, length: 0 };

  return {
    connection: {
      ...connection,
      segments: [...connection.segments, fin, finAck, serverFin, lastAck],
      client: { state: 'TIME_WAIT', seq: client.seq + 1, ack: server.seq + 1 },
      server: { state: 'CLOSED', seq: server.seq + 1, ack: client.seq + 1 },
      timeWaitAt: connection.tick,
    },
    note: 'FIN → ACK → FIN → ACK。閉じた側は TIME_WAIT に入る',
    error: null,
  };
}

/** 時間を進める。TIME_WAIT が明ければ CLOSED になる */
export function advance(connection: Connection, ticks = 1): Connection {
  const tick = connection.tick + ticks;
  if (
    connection.client.state === 'TIME_WAIT' &&
    connection.timeWaitAt !== null &&
    tick - connection.timeWaitAt >= TIME_WAIT_TICKS
  ) {
    return {
      ...connection,
      tick,
      client: { ...connection.client, state: 'CLOSED' },
      timeWaitAt: null,
    };
  }
  return { ...connection, tick };
}

/** 落ちたセグメントを再送する */
export function retransmit(connection: Connection): StepResult {
  const last = connection.segments[connection.segments.length - 1];
  if (last === undefined) return { connection, note: '', error: '送ったものがありません' };
  const index = connection.segments.length;
  if (isDropped(connection, index)) {
    return {
      connection: { ...connection, segments: record(connection, last), retransmits: connection.retransmits + 1 },
      note: '再送したがまた落ちた',
      error: null,
    };
  }

  if (last.flags.includes('SYN') && !last.flags.includes('ACK')) {
    const { client, server } = connection;
    const synAck: Segment = { from: 'server', flags: ['SYN', 'ACK'], seq: server.seq, ack: client.seq + 1, length: 0 };
    const ack: Segment = { from: 'client', flags: ['ACK'], seq: client.seq + 1, ack: server.seq + 1, length: 0 };
    return {
      connection: {
        ...connection,
        segments: [...connection.segments, last, synAck, ack],
        client: { state: 'ESTABLISHED', seq: client.seq + 1, ack: server.seq + 1 },
        server: { state: 'ESTABLISHED', seq: server.seq + 1, ack: client.seq + 1 },
        retransmits: connection.retransmits + 1,
      },
      note: 'SYN を再送し、今度は届いた',
      error: null,
    };
  }

  const ack: Segment = {
    from: 'server',
    flags: ['ACK'],
    seq: connection.server.seq,
    ack: last.seq + last.length,
    length: 0,
  };
  return {
    connection: {
      ...connection,
      segments: [...connection.segments, last, ack],
      client: { ...connection.client, seq: last.seq + last.length },
      server: { ...connection.server, ack: last.seq + last.length },
      retransmits: connection.retransmits + 1,
    },
    note: '再送して ACK を受け取った',
    error: null,
  };
}

/** 再送の待ち時間。倍々に伸びる（指数バックオフ） */
export function retransmitTimeout(attempt: number, baseTicks = 1): number {
  return baseTicks * 2 ** Math.max(0, attempt - 1);
}
