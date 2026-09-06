import type { WordPart } from './tokenizer';

export interface Word {
  parts: WordPart[];
  raw: string;
  quoted: boolean;
}

export interface Redirect {
  kind: '>' | '>>' | '<';
  target: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
  /** << で渡される標準入力（区切り語まで読んだ本文） */
  heredoc?: string;
}

export interface Pipeline {
  commands: SimpleCommand[];
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
