import type { PageSlot } from './distribute';
import { mergePageLayers } from './pageConfig';
import type { ResolvedPageConfig } from './pageConfig';
import { formatPageNumber } from './pageNumbers';
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
}

function checkStart(start: number | undefined, where: string): void {
  if (start !== undefined && !Number.isInteger(start)) {
    throw new Error(`html-paginator: ${where}.start must be an integer, got ${start}`);
  }
}

export function createPageLayout(config: PageLayoutConfig): PageLayout {
  checkStart(config.pageNumbers?.start, 'pageNumbers');
  for (const [name, section] of Object.entries(config.sections ?? {})) {
    checkStart(section.pageNumbers?.start, `sections.${name}.pageNumbers`);
  }

  const plans: PagePlan[] = [];
  let runs = 0;
  let instances = 0;

  const sectionConfig = (name: string | undefined): SectionConfig | undefined =>
    name === undefined ? undefined : config.sections?.[name];

  const lastPlan = (): PagePlan | undefined => plans[plans.length - 1];

  const formatOf = (plan: PagePlan) =>
    sectionConfig(plan.section)?.pageNumbers?.format ?? config.pageNumbers?.format;

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
      plans.push({
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

  const buildContext = (
    page: number,
    totalPages: number,
    last: { number: number; plan: PagePlan },
  ): PageContext => {
    const p = plan(page);
    const sectionPages = plans.filter((q) => q.instance === p.instance).length;
    return {
      page,
      totalPages,
      pageNumber: p.number,
      pageLabel: formatPageNumber(p.number, formatOf(p)),
      lastPageNumber: last.number,
      lastPageLabel: formatPageNumber(last.number, formatOf(last.plan)),
      section: p.section,
      sectionPage: p.sectionPage,
      sectionPages,
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
      const parity = p.number % 2 === 0 ? 'evenPages' : 'oddPages';
      return mergePageLayers(
        config.page,
        section?.page,
        config[parity],
        section?.[parity],
        page === 1 ? config.firstPage : undefined,
        p.sectionPage === 1 ? section?.firstPage : undefined,
        config.pageOverrides?.[page],
      );
    },

    context(page, totalPages) {
      plan(totalPages);
      const p = plan(page);
      let last = p;
      for (let i = page; i < totalPages && plans[i]!.run === p.run; i++) last = plans[i]!;
      return buildContext(page, totalPages, { number: last.number, plan: last });
    },

    probeContext(page, placeholderTotal) {
      const p = plan(page);
      return buildContext(page, placeholderTotal, {
        number: p.number + Math.max(0, placeholderTotal - page),
        plan: p,
      });
    },
  };
}
