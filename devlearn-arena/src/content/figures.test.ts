import { describe, expect, it } from 'vitest';
import { figureTitle } from './figures';

describe('図の題', () => {
  it('SVG の文字の参照（&lt; &gt; &amp; &quot;）は元の字に戻す（画面の説明に &lt; と出ていた）', () => {
    expect(figureTitle('git-b06-markers')).toContain('<<<<<<< HEAD から ======= まで');
    expect(figureTitle('git-b06-markers')).not.toContain('&lt;');
    expect(figureTitle('git-b06-markers')).toContain('>>>>>>> feature');
  });
});
