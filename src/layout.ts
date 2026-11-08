import type { PageSlot } from './distribute';
import { bookMargins, mergePageLayers } from './pageConfig';
import type { ResolvedPageConfig } from './pageConfig';
import { formatPageNumber } from './pageNumbers';
import type { RunningValues } from './running';
import type { PageConfig, PageContext, PageNumbering, SectionConfig } from './types';

/** Everything that decides how a page looks and how it is numbered. */
export interface PageLayoutConfig {
  page?: PageConfig;
  firstPage?: PageConfig;
  oddPages?: PageConfig;
  evenPages?: PageConfig;
  pageOverrides?: Record<number, PageConfig>;
  pageNumbers?: PageNumbering;
  sections?: Record<string, SectionConfig>;
}

/**
 * Per-page layout state, built page by page as distribution opens pages
 * (sections are only known then). The single source of page config and
 * header/footer context for both measurement and rendering.
 */
export interface PageLayout {
  /**
   * Record that `page` opened in `slot`. Pages open in order; a page already
   * recorded is left as is.
   */
  open(page: number, slot: PageSlot): void;
  /** Whether a blank page must precede `page` so `section` starts on its side. */
  blankPageBefore(section: string, page: number): boolean;
  /** Resolved config (size, margin, header, footer) of a page. */
  config(page: number): ResolvedPageConfig;
  /** Header/footer context of a page once all `totalPages` are known. */
  context(page: number, totalPages: number): PageContext;
  /**
   * Context while measuring, before the page count is known: numbering runs
   * are assumed to continue up to `placeholderTotal` pages.
   */
  probeContext(page: number, placeholderTotal: number): PageContext;
  /**
   * Running header values: `pages[i]` for page i + 1 once known; until then
   * (while measuring) every page gets `probe`.
   */
  setRunning(probe: Record<string, string>, pages?: readonly RunningValues[]): void;
}

interface PagePlan {
  section?: string;
  /** 1-based page index within its section. */
  sectionPage: number;
  /** Displayed page number. */
  number: number;
  /** Id of the continuous numbering run the page is in. */
  run: number;
  /** Id of the section instance (the same section name may start again). */
  instance: number;
  /**
   * Sections whose page layers apply, in order: the page's own, after those
   * it links to (`linkToPrevious`).
   */
  chain: string[];
}

function checkNumbering(numbering: PageNumbering | undefined, where: string): void {
  const start = numbering?.start;
  if (start !== undefined && !Number.isInteger(start)) {
    throw new Error(`html-paginator: ${where}.start must be an integer, got ${start}`);
  }
  const chapter = numbering?.chapter;
  if (chapter !== undefined && (!Number.isInteger(chapter) || chapter < 0 || chapter > 6)) {
    throw new Error(`html-paginator: ${where}.chapter must be a heading level 0-6, got ${chapter}`);
  }
}

export function createPageLayout(config: PageLayoutConfig): PageLayout {
  checkNumbering(config.pageNumbers, 'pageNumbers');
  for (const [name, section] of Object.entries(config.sections ?? {})) {
    checkNumbering(section.pageNumbers, `sections.${name}.pageNumbers`);
  }

  const plans: PagePlan[] = [];
  let runs = 0;
  let instances = 0;

  const sectionConfig = (name: string | undefined): SectionConfig | undefined =>
    name === undefined ? undefined : config.sections?.[name];

  const lastPlan = (): PagePlan | undefined => plans[plans.length - 1];

  const formatOf = (plan: PagePlan) =>
    sectionConfig(plan.section)?.pageNumbers?.format ?? config.pageNumbers?.format;

  /** Page label: the formatted number, after the chapter number if asked for. */
  const labelOf = (number: number, plan: PagePlan, running: RunningValues): string => {
    const label = formatPageNumber(number, formatOf(plan));
    const own = sectionConfig(plan.section)?.pageNumbers;
    const level = own?.chapter ?? config.pageNumbers?.chapter;
    if (!level) return label;
    const separator = own?.chapterSeparator ?? config.pageNumbers?.chapterSeparator ?? '-';
    return `${running.running[`outline.h${level}`] ?? '0'}${separator}${label}`;
  };

  const open = (page: number, slot: PageSlot): void => {
    // Fill gaps (standalone use without a distribution) by continuing.
    while (plans.length < page - 1) {
      open(plans.length + 1, { section: lastPlan()?.section, sectionStart: false, blank: false });
    }
    if (page <= plans.length) return;

    const prev = lastPlan();
    if (!prev || slot.sectionStart) {
      const start = sectionConfig(slot.section)?.pageNumbers?.start;
      const restart = !prev || start !== undefined;
      const own = slot.section === undefined ? [] : [slot.section];
      plans.push({
        chain: prev && sectionConfig(slot.section)?.linkToPrevious ? [...prev.chain, ...own] : own,
        section: slot.section,
        sectionPage: 1,
        number: start ?? (prev ? prev.number + 1 : (config.pageNumbers?.start ?? 1)),
        run: restart ? ++runs : prev!.run,
        instance: ++instances,
      });
    } else {
      plans.push({ ...prev, sectionPage: prev.sectionPage + 1, number: prev.number + 1 });
    }
  };

  const plan = (page: number): PagePlan => {
    if (page > plans.length) {
      open(page, { section: lastPlan()?.section, sectionStart: false, blank: false });
    }
    return plans[page - 1] as PagePlan;
  };

  let runningProbe: Record<string, string> = {};
  let runningPages: readonly RunningValues[] | undefined;

  const buildContext = (
    page: number,
    totalPages: number,
    last: { number: number; plan: PagePlan; running: RunningValues },
    running: RunningValues,
  ): PageContext => {
    const p = plan(page);
    const sectionPages = plans.filter((q) => q.instance === p.instance).length;
    return {
      page,
      totalPages,
      pageNumber: p.number,
      pageLabel: labelOf(p.number, p, running),
      lastPageNumber: last.number,
      lastPageLabel: labelOf(last.number, last.plan, last.running),
      section: p.section,
      sectionPage: p.sectionPage,
      sectionPages,
      running: running.running,
      runningLast: running.runningLast,
    };
  };

  return {
    open,

    blankPageBefore(section, page) {
      if (page <= 1) return false;
      const side = sectionConfig(section)?.start ?? 'next';
      if (side === 'odd') return page % 2 === 0;
      if (side === 'even') return page % 2 === 1;
      return false;
    },

    config(page) {
      const p = plan(page);
      const section = sectionConfig(p.section);
      const even = p.number % 2 === 0;
      const parity = even ? 'evenPages' : 'oddPages';
      const chain = p.chain.map(sectionConfig);
      return bookMargins(
        mergePageLayers(
          config.page,
          ...chain.map((linked) => linked?.page),
          config[parity],
          ...chain.map((linked) => linked?.[parity]),
          page === 1 ? config.firstPage : undefined,
          p.sectionPage === 1 ? section?.firstPage : undefined,
          config.pageOverrides?.[page],
        ),
        even,
      );
    },

    context(page, totalPages) {
      plan(totalPages);
      const p = plan(page);
      let last = p;
      let lastPage = page;
      for (let i = page; i < totalPages && plans[i]!.run === p.run; i++) {
        last = plans[i]!;
        lastPage = i + 1;
      }
      const runningOf = (n: number) => runningPages?.[n - 1] ?? { running: {}, runningLast: {} };
      return buildContext(
        page,
        totalPages,
        { number: last.number, plan: last, running: runningOf(lastPage) },
        runningOf(page),
      );
    },

    probeContext(page, placeholderTotal) {
      const p = plan(page);
      return buildContext(
        page,
        placeholderTotal,
        {
          number: p.number + Math.max(0, placeholderTotal - page),
          plan: p,
          running: { running: runningProbe, runningLast: runningProbe },
        },
        { running: runningProbe, runningLast: runningProbe },
      );
    },

    setRunning(probe, pages) {
      runningProbe = probe;
      runningPages = pages;
    },
  };
}
