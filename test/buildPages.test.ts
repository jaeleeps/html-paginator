import { describe, expect, it } from 'vitest';
import { buildPages, CLASS_NAMES } from '../src/buildPages';
import type { DistributedPage } from '../src/distribute';

function el(text: string): HTMLElement {
  const e = document.createElement('p');
  e.textContent = text;
  return e;
}

function dist(page: number, items: HTMLElement[]): DistributedPage<HTMLElement> {
  return { page, items, usedHeight: 0, availableHeight: 100, overflows: false };
}

describe('buildPages', () => {
  it('builds container > page > body structure', () => {
    const a = el('a');
    const b = el('b');
    const { container, pages } = buildPages([dist(1, [a]), dist(2, [b])], { document });

    expect(container.className).toBe(CLASS_NAMES.container);
    expect(pages).toHaveLength(2);
    expect(container.children).toHaveLength(2);

    const body1 = pages[0]?.querySelector(`.${CLASS_NAMES.body}`);
    expect(body1?.children).toHaveLength(1);
    expect(body1?.children[0]).toBe(a); // moved, not cloned
    expect(pages[1]?.dataset.page).toBe('2');
  });

  it('renders header/footer with { page, totalPages }', () => {
    const { pages } = buildPages([dist(1, [el('a')]), dist(2, [el('b')])], {
      document,
      page: {
        header: ({ page, totalPages }) => `<header>${page}/${totalPages}</header>`,
        footer: '<footer>f</footer>',
      },
    });

    const header2 = pages[1]?.querySelector(`.${CLASS_NAMES.header}`);
    expect(header2?.textContent).toBe('2/2');
    expect(pages[0]?.querySelector(`.${CLASS_NAMES.footer}`)?.textContent).toBe('f');
  });

  it('omits header/footer elements when not configured', () => {
    const { pages } = buildPages([dist(1, [el('a')])], { document });
    expect(pages[0]?.querySelector(`.${CLASS_NAMES.header}`)).toBeNull();
    expect(pages[0]?.querySelector(`.${CLASS_NAMES.footer}`)).toBeNull();
    expect(pages[0]?.querySelector(`.${CLASS_NAMES.body}`)).not.toBeNull();
  });

  it('applies per-page overrides (remove footer, custom margin)', () => {
    const { pages } = buildPages(
      [dist(1, [el('a')]), dist(2, [el('b')]), dist(3, [el('c')])],
      {
        document,
        page: { margin: '10mm', footer: '<footer>f</footer>' },
        pageOverrides: {
          1: { margin: '30mm' },
          3: { footer: null },
        },
      },
    );

    expect(pages[0]?.style.padding).toBe('30mm');
    expect(pages[1]?.style.padding).toBe('10mm');
    expect(pages[0]?.querySelector(`.${CLASS_NAMES.footer}`)).not.toBeNull();
    expect(pages[2]?.querySelector(`.${CLASS_NAMES.footer}`)).toBeNull();
  });

  it('applies page size to the page element', () => {
    const { pages } = buildPages([dist(1, [el('a')])], {
      document,
      page: { size: 'a4' },
    });
    expect(pages[0]?.style.width).toBe('210mm');
    expect(pages[0]?.style.height).toBe('297mm');
  });

  it('header order: header, body, footer', () => {
    const { pages } = buildPages([dist(1, [el('a')])], {
      document,
      page: { header: '<header>h</header>', footer: '<footer>f</footer>' },
    });
    const classes = Array.from(pages[0]?.children ?? []).map((c) => c.className);
    expect(classes).toEqual([CLASS_NAMES.header, CLASS_NAMES.body, CLASS_NAMES.footer]);
  });
});
