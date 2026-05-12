# Changelog

## [Unreleased]

## [1.5.0] - 2026-04-27
### Added
- Multi-SERP expansion: after crawling the target, extracts H2/H3 topic phrases and runs up to 3 additional SERP queries to surface topically adjacent candidates that slug scoring alone would miss
- Placement hints: each result card now shows "Place near: [heading]" — the best heading on the source page to add the link
- Link stats bar: shows outbound link count, candidates checked, and already-linked counts for the target page
- CSV export: "↓ Export CSV" button downloads all results with Type, Title, URL, Relevance, Anchor, and Place Near columns

## [1.4.0] - 2026-04-25
### Added
- Utility page filter: contact, about, privacy, terms, login, cart, FAQ, etc. excluded from link candidates
- Anchor text cannibalization prevention: Claude avoids using the target page's focus keywords as anchor text for outgoing LINK:TO links

## [1.3.0] - 2026-04-23
### Added
- Claude-scored relevance: match % now reflects topical understanding, not just keyword overlap
- Single batch call handles both anchor text and relevance scoring (~same cost as before)
### Changed
- Candidate page limit reduced 40→25 to ensure Claude call completes within request window

## [1.2.1] - 2026-04-22
### Changed
- Field-weighted relevance scoring: title/H1 weighted 5x, headings/meta 3x, body 1x
- Scores normalized to 0–100 relative to top result (more meaningful percentages)

## [1.2.0] - 2026-04-22
### Added
- Claude Haiku anchor text suggestions via single batch API call (~$0.005/run)
- H2/H3 heading extraction in crawler for heading-based anchor fallback
- Graceful fallback: heading-based anchors if Claude call fails or key missing

## [1.0.0] - 2026-04-21
### Added
- Target URL input with sitemap.xml and keyword+SERP discovery modes
- Recursive sitemap index support (sitemap_index.xml, up to 3 levels deep)
- Cosine similarity scoring for link:from and link:to recommendations
- Suggested anchor text for each opportunity (text-match fallback)
- Both discovery modes (sitemap + SERP) can be used simultaneously
- Dark UI matching JPSDevelops tool design system (Poppins, cyan accents)
- Railway-ready deployment with `package.json` start script
