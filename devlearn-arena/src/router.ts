import { useEffect, useState } from 'react';
import { DOMAIN_IDS, type DomainId } from './content/schema';

/**
 * 画面の道すじ（docs/architecture.md 4 章）。ハッシュで切り替える（#/city など）。
 * GitHub Pages の直リンクとリロードで 404 にならない。
 *
 *   #/city                    都市画面
 *   #/learn                   学習ライブラリ（#/learn?domain=k8s で分野を絞る）
 *   #/learn/<レッスン ID>      そのレッスン（入口の札を開く）
 *   #/graph                   知識グラフ（#/graph/<レッスン ID> で札を開く）
 *   #/lesson/<レッスン ID>     レッスン画面（7 段の学習。施設の中に入る別の画面）
 *   #/glossary[/<用語 ID>]     用語集
 *   #/growth                  成長画面
 *   #/settings                設定（保存の書き出し・読み込み・やり直し）
 *   #/missions[/<ミッション ID>] ミッション一覧（ID で選んだ状態で開く）
 *   #/mission/<ミッション ID>   ミッションの実戦（施設の中に入る別の画面）
 */
export type Route =
  | { name: 'city' }
  | { name: 'growth' }
  | { name: 'settings' }
  | { name: 'learn'; view: 'list' | 'graph'; lessonId?: string; domain?: DomainId }
  | { name: 'glossary'; termId?: string }
  | { name: 'lesson'; lessonId: string }
  | { name: 'missions'; missionId?: string }
  | { name: 'mission'; missionId: string };

const LESSON_ID = /^[a-z0-9]+\.[bia]\.\d+$/;
const MISSION_ID = /^[a-z0-9-]+$/;

export function parseHash(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const [, head = '', arg = ''] = path.split('/');
  const params = new URLSearchParams(query);
  switch (head) {
    case 'growth':
      return { name: 'growth' };
    case 'settings':
      return { name: 'settings' };
    case 'learn':
    case 'graph': {
      const route: Route = { name: 'learn', view: head === 'graph' ? 'graph' : 'list' };
      const id = decodeURIComponent(arg);
      if (LESSON_ID.test(id)) route.lessonId = id;
      const domain = params.get('domain');
      if (domain && (DOMAIN_IDS as readonly string[]).includes(domain)) route.domain = domain as DomainId;
      return route;
    }
    case 'glossary': {
      const id = decodeURIComponent(arg);
      return /^[a-z0-9-]+$/.test(id) ? { name: 'glossary', termId: id } : { name: 'glossary' };
    }
    case 'lesson': {
      const id = decodeURIComponent(arg);
      // ID の形でなければ学習ライブラリへ
      return LESSON_ID.test(id) ? { name: 'lesson', lessonId: id } : { name: 'learn', view: 'list' };
    }
    case 'missions': {
      const id = decodeURIComponent(arg);
      return MISSION_ID.test(id) ? { name: 'missions', missionId: id } : { name: 'missions' };
    }
    case 'mission': {
      const id = decodeURIComponent(arg);
      // ID の形でなければミッション一覧へ
      return MISSION_ID.test(id) ? { name: 'mission', missionId: id } : { name: 'missions' };
    }
    default:
      return { name: 'city' };
  }
}

/** 道すじからハッシュを作る */
export function hashOf(route: Route): string {
  switch (route.name) {
    case 'city':
      return '#/city';
    case 'growth':
      return '#/growth';
    case 'settings':
      return '#/settings';
    case 'glossary':
      return route.termId ? `#/glossary/${route.termId}` : '#/glossary';
    case 'lesson':
      return `#/lesson/${route.lessonId}`;
    case 'missions':
      return route.missionId ? `#/missions/${route.missionId}` : '#/missions';
    case 'mission':
      return `#/mission/${route.missionId}`;
    case 'learn': {
      const base = route.view === 'graph' ? '#/graph' : '#/learn';
      const path = route.lessonId ? `${base}/${route.lessonId}` : base;
      return route.domain ? `${path}?domain=${route.domain}` : path;
    }
  }
}

/** 画面を移る（ブラウザの「戻る」で 1 つ前の画面へ戻れるように、履歴に積む） */
export function go(route: Route): void {
  window.location.hash = hashOf(route);
}

/** 同じ画面の中で選んだ物を、履歴に積まずにハッシュへ写す（直リンクとリロードで同じ所を開くため） */
export function mark(route: Route): void {
  const hash = hashOf(route);
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
