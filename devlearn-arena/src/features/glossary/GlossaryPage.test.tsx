import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import GlossaryPage from './GlossaryPage';

describe('用語集の画面', () => {
  it('語と言い換えと、その語が出てくる任務への道を並べる', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GlossaryPage />
      </MemoryRouter>,
    );
    expect(html).toContain('id="term-Pod"');
    expect(html).toContain('自分では生き返らない');
    expect(html).toContain('href="/?mission=');
  });
});
