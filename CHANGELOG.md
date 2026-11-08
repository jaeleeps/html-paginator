# Changelog

All notable changes to html-paginator. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/).

## [1.1.0] - 2026-11-08

Word-like layout: sections, footnotes and endnotes, a table of contents and an index, columns, running headers, facing pages and more. Everything new is opt-in, and no export was removed, but **existing documents can paginate differently** (see Changed).

### Changed

- **Paragraphs split between lines.** An element with `data-break="auto"` (the default) that holds inline text now splits between lines where it used to move to the next page whole, keeping at least 2 lines on each side (CSS `orphans` / `widows`). Pages come out fuller and a document can have fewer pages. Use `data-break="avoid"` to keep an element whole. (#20)
- **Table rows split across pages** at a line, across all cells, when a row does not fit. (#22)
- **Headings keep with the next element** (Word's "Keep with next"), so a heading is no longer left alone at the foot of a page. Turn it off with `keepHeadingsWithNext: false`. (#17)
- Items are measured on the page they land on (its margins, header and footer), and collapsed margins are measured correctly. (#12, #31)
- `MeasureAdapter.measure` receives the page number as an optional second argument (#12). `PageContext.page` is the physical page index; the new `pageNumber` holds the displayed number (#15).
- `VERSION` now reports the package version; it was stuck at `0.0.1`.

### Added

- **Page breaks and numbering:** forced page breaks (`data-break-before` / `data-break-after`, CSS `break-*`) (#14); page number formats and a start number (#15); chapter numbers in page numbers (#40).
- **Page variants and sections:** different first page and odd/even pages (#16); sections with their own numbering, headers and footers, starting on an odd or even page (#18); continuous section breaks (#37); Link to Previous (`linkToPrevious`) (#58, #59).
- **Page setup:** landscape orientation (#31); watermarks and page backgrounds (#32); header and footer distance from the sheet edge (#36); vertical alignment (#44); page borders (#45); mirror margins and gutter (#46); gutter position (#55).
- **Columns:** multi-column sections with a line between (#33); column balancing before continuous breaks and with `balanceColumns` (#37, #39, #43).
- **Tables:** columns kept aligned across pages (#23); per-table header repeat (#27).
- **Notes:** footnotes (#24) with numbering options (#26), continuation onto the next page (#30), position beneath the text (#50) and a continuation notice (#56); endnotes (#28), at the end of each section if wanted (#47); declarative note options (#48).
- **Fields and references:** table of contents and page references (#21); page fields in content (#25); numbered captions, cross-references and lists of figures (#29), with chapter numbers (#34); an index, repaginated with its real page numbers (#51).
- **Other:** line numbers (#35); running headers (Word STYLEREF) (#38); `whenContentReady` and `paginateWhenReady()` to wait for images and web fonts (#52); right-to-left columns and line numbers (#53).
- `examples/showcase.html`, a short book using most of the above, and README diagrams (#60).

### Fixed

- Content lost when a split container retried on a fresh page (#9).
- Loose text and `tfoot` dropped when splitting DOM content (#10).
- Feature interactions found by a kitchen-sink end-to-end test (#41).

### Performance

- Fewer column balancing trials (#42), and one measuring probe in the document at a time: about twice as fast on long documents (#54).

## [1.0.1] - 2026-08-23

### Fixed

- README images on npm.

## [1.0.0] - 2026-08-23

Initial release: greedy first-fit pagination with per-page headers and footers, `data-break` control, table splitting with repeated headers, a declarative mode and print-ready output.

[1.1.0]: https://github.com/jaeleeps/html-paginator/compare/21426b4...v1.1.0
[1.0.1]: https://www.npmjs.com/package/html-paginator/v/1.0.1
[1.0.0]: https://www.npmjs.com/package/html-paginator/v/1.0.0
