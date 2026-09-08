import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ja } from './ja';
import { missingKeys, translate } from './index';

describe('翻訳', () => {
  it('en に訳の抜けが無い', () => {
    expect(missingKeys('en')).toEqual([]);
  });

  it('en に余分な鍵が無い', () => {
    const known = new Set(Object.keys(ja));
    expect(Object.keys(en).filter((k) => !known.has(k))).toEqual([]);
  });

  it('プレースホルダの並びが両言語で一致する', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(placeholders(en[key]), `${key} のプレースホルダが違います`).toEqual(
        placeholders(ja[key]),
      );
    }
  });

  it('値を差し込める', () => {
    expect(translate('en', 'track.minutes', { n: 12 })).toBe('about 12 min');
    expect(translate('ja', 'track.minutes', { n: 12 })).toBe('約 12 分');
  });

  it('未知の差し込みはそのまま残す', () => {
    expect(translate('ja', 'dash.level', {})).toBe('レベル {n}');
  });
});
