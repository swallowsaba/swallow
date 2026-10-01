import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Glossed, Term } from './Term';

describe('用語に説明を付ける', () => {
  it('用語集の語には平易な説明が付く', () => {
    const html = renderToStaticMarkup(<Term term="Pod" />);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('自分では生き返らない');
  });

  it('用語集に無い語は、ただの文字として出す', () => {
    const html = renderToStaticMarkup(<Term term="ふつうの言葉" />);
    expect(html).toBe('ふつうの言葉');
  });

  it('文章の中の用語に自動で説明が付く', () => {
    const html = renderToStaticMarkup(<Glossed text="Service が Pod に繋ぐ" />);
    expect(html.match(/role="tooltip"/g)?.length).toBe(2);
  });
});
