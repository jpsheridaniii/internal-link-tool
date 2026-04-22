# Changelog

## [Unreleased]

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
