import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/renderTemplate';

const ctx = { page: 2, totalPages: 5 };

describe('renderTemplate', () => {
  it('returns null for null/undefined/empty string', () => {
    expect(renderTemplate(null, ctx, document)).toBeNull();
    expect(renderTemplate(undefined, ctx, document)).toBeNull();
    expect(renderTemplate('   ', ctx, document)).toBeNull();
  });

  it('parses an HTML string', () => {
    const el = renderTemplate('<header class="x">Hi</header>', ctx, document);
    expect(el?.tagName).toBe('HEADER');
    expect(el?.className).toBe('x');
    expect(el?.textContent).toBe('Hi');
  });

  it('wraps multi-root HTML fragments', () => {
    const el = renderTemplate('<span>a</span><span>b</span>', ctx, document);
    expect(el?.children.length).toBe(2);
  });

  it('clones an HTMLElement (does not reuse the original)', () => {
    const original = document.createElement('footer');
    original.textContent = 'foot';
    const el = renderTemplate(original, ctx, document);
    expect(el?.tagName).toBe('FOOTER');
    expect(el).not.toBe(original);
  });

  it('clones <template> content via selector', () => {
    document.body.innerHTML = '<template id="tpl"><nav>menu</nav></template>';
    const el = renderTemplate('#tpl', ctx, document);
    expect(el?.tagName).toBe('NAV');
    expect(el?.textContent).toBe('menu');
  });

  it('clones a regular element via selector', () => {
    document.body.innerHTML = '<div id="hdr">header</div>';
    const el = renderTemplate('#hdr', ctx, document);
    expect(el?.textContent).toBe('header');
    expect(el).not.toBe(document.getElementById('hdr'));
  });

  it('treats non-matching plain strings as text', () => {
    document.body.innerHTML = '';
    const el = renderTemplate('Confidential', ctx, document);
    expect(el?.textContent).toBe('Confidential');
  });

  it('calls template functions with the page context', () => {
    const el = renderTemplate(
      ({ page, totalPages }) => `<span>Page ${page} of ${totalPages}</span>`,
      ctx,
      document,
    );
    expect(el?.textContent).toBe('Page 2 of 5');
  });

  it('supports functions returning elements', () => {
    const el = renderTemplate(
      () => {
        const e = document.createElement('em');
        e.textContent = 'x';
        return e;
      },
      ctx,
      document,
    );
    expect(el?.tagName).toBe('EM');
  });
});
