import type { WordPart } from './tokenizer';

export interface Word {
  parts: WordPart[];
  raw: string;
  quoted: boolean;
}

export interface Redirect {
  /** 2> は標準エラー、&> は両方をまとめて移す。2>&1 は標準エラーを、その時の標準出力の行き先へ（>&2 は逆）。この 2 つの target は空 */
  kind: '>' | '>>' | '<' | '2>' | '2>>' | '&>' | '&>>' | '2>&1' | '>&2';
  target: Word;
}

export interface SimpleCommand {
  kind?: undefined;
  words: Word[];
  redirects: Redirect[];
  /** << で渡される標準入力（区切り語まで読んだ本文） */
  heredoc?: string;
}

/** 組み立ての形（if・for・while）。全体を 1 つのコマンドとして、パイプやリダイレクトに使える */
export type CompoundCommand =
  | { kind: 'if'; clauses: { cond: CommandList; body: CommandList }[]; otherwise: CommandList | null; redirects: Redirect[] }
  /** words が null なら、位置パラメータ（$@）を繰り返す */
  | { kind: 'for'; name: string; words: Word[] | null; body: CommandList; redirects: Redirect[] }
  /** until は、条件が成り立つまで繰り返す */
  | { kind: 'while'; until: boolean; cond: CommandList; body: CommandList; redirects: Redirect[] };

export type Command = SimpleCommand | CompoundCommand;

export interface Pipeline {
  commands: Command[];
}

/** 直後のパイプラインとの接続方法。最後の要素は null。 */
export type Connector = '&&' | '||' | ';' | null;

export interface ListItem {
  pipeline: Pipeline;
  connector: Connector;
}

export interface CommandList {
  items: ListItem[];
}
