# Dimension Eight Labs website

The static website for Dimension Eight Labs, built with plain HTML, CSS, and minimal JavaScript.

## Local preview

From the repository root, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

The site is deployed through GitHub Pages at the custom domain <https://dim8labs.com>.

## Interior pages

- `/portfolio/` is the interior root, with Rob Haag's identity strip and reusable engineering project rows.
- `/portfolio/projects/absurdly-accurate-clock/` is the first project's engineering case study.
- `/website-examples/` is a placeholder for the separately planned examples page.
- `js/interior.js` defines the shared `<dim8-header current-page="…">` component and the contact dialog interaction. Future interior pages should load this script and `css/interior.css` after `css/main.css`, and use `body.interior-page` and `main.interior-main`. Header links resolve from the script URL. Do not load the landing animation script on interior pages.
- The header reuses the seven-segment mark by cropping the existing `images/dim8-vfd-logo.png` in CSS.
- Ordinary text links use `dim8-link`, an alias of the landing page's `github-link` rules in `css/main.css`, with explicit designed link/visited states. Include a literal `→` in the label. The contact trigger uses the same rules with a full native button presentation reset; modal controls are separate functional controls. Interior asset URLs carry a revision query so cached earlier styles cannot leave the new link class unstyled; bump this revision together when shared assets change.
- Shared interior typography separates chrome from content: the header, branding, action links, and utility accents keep the Dim8 cyan palette; main headings use `--content-heading`, body copy uses `--content-text`, and notes/captions use `--content-secondary`. These are neutral off-whites on dark charcoal. Content inherits the existing body font stack, uses normal body tracking, 16px/1.75 reading text, and moderately weighted headings. Future main content inherits this treatment automatically; `.project-detail-content` limits prose lines to 70ch while leaving the page/artwork width intact. Do not use the branding palette for normal engineering prose.
- The identity strip contains two vertical groups: Rob Haag / resume on the left, Contact / location on the right. Narrow screens stack the groups when needed. The inline PDF document icon uses a 32×38px frame and readable 12px PDF lettering.

## Adding engineering projects

Repeat the `.project-entry` article inside `.portfolio-projects`, keeping `.project-media` first and `.project-copy` second in the HTML. Give each title a unique ID and reference it with the article's `aria-labelledby`. The shared CSS uses equal columns with top alignment, puts the first image on the left, and reverses every even row. At mobile widths all rows use image-first order. Rows are separated by whitespace rather than cards or panels.

Replace `.project-image-placeholder` with an `<img>` with meaningful alt text. The placeholder defaults to 4:3; set `--project-image-ratio` on the media link to suit the actual artwork rather than treating the placeholder ratio as final. Images use `object-fit: contain`, preserving the full artwork and its proportions. Point the image and Project Details link at the same detail route. Each detail page uses the existing header component, interior styles, and the `.project-detail` / `.project-detail-content` structure; use relative asset paths appropriate to its depth.

Entries 2–4 (`data-temporary-project`) are explicitly temporary layout tests, with neutral copy and no real repositories. Their image and details links share `/portfolio/projects/placeholder/?project=2` (or `3`/`4`), one temporary detail stub whose title is selected by `js/interior.js`. Remove those entries, that route, and the temporary title-selection code after evaluation.

The clock's index summary and GitHub URL are supplied project content. Both the index image and full-width detail hero use the existing `images/AAC-Clock-Project-Page-Image.png` unchanged, at its natural 1672:941 ratio. The detail hero includes the supplied AI-assisted visualization caption; the index thumbnail has no caption. The detail page uses `css/project-detail.css` for document flow and full-width image positions, while retaining the shared shell, content typography and link rules.

The System Architecture section after the overview embeds the SVG from `images/interactive-diagrams/absurdly-accurate-clock-architecture.html` directly in the page. Keep that standalone source in the repository. `css/aac-architecture.css` contains only diagram-scoped artwork styles and palette variables; SVG IDs and marker/filter references are prefixed to avoid document collisions. The source's 1420×820 viewBox, geometry, technical labels and explanatory note are preserved. The standalone title, subtitle and scrollable frame are omitted. The SVG scales proportionally across the full existing content width with no minimum-width constraint, crop or horizontal scrolling. When updating the artwork, synchronize the inline SVG and scoped styles with the source.

### Clock case-study sources

The case study summarizes [absurdly-accurate-clock](https://github.com/rhaag71/absurdly-accurate-clock) at commit `1ee24d72ed36da66b061a3a4e2f9a9446dfa326c`. HTML comments identify the source documents for each section:

- `README.md`: firmware/build context, standalone operation, VFD wiring observations, watchdog behavior and its separate bench-test procedure.
- `docs/architectural-docs/overview.md`: UTC ownership, architectural boundaries, cooperative execution, evidence terminology and limitations.
- `docs/pps-timebase.md`: receiver contract, label/edge association, qualification/loss rules, visual indicator and blank-cell strategy.
- `docs/display-timezone.md`: presentation-only civil time, button behavior, current diagnostics and UART-acceptance limits.
- `docs/hh-zero-investigation.md`: the current contiguous-hour accommodation and its outstanding physical verification. Historical findings are not treated as current serializer behavior.
- `docs/clock-network-protocol.md`: current v1 packet, coherent snapshots, SPI lifecycle, TIME_SYNC semantics and consumer responsibilities.
- `docs/pico-spi-investigation.md`: final hardware acceptance of the reset-storm and first-byte corrections, including retained startup faults and the limits of causal inference.

The newer protocol and final acceptance record supersede the overview's older pre-acceptance transport notes. Implemented source/interface behavior is separated from physical observations, test procedures and future work. The page makes no absolute timing or end-to-end NTP accuracy claim; holdover remains future work and leap-second handling is unsupported. When updating the page, recheck the relevant documents and preserve these evidence distinctions.

Intentional TODO in `portfolio/index.html`: connect contact submission once a delivery mechanism is chosen. The form currently validates fields, reports that sending is not connected, and makes no submission request.

There is no build step or existing test suite. Preview with the server above; JavaScript syntax can be checked with `node --check js/interior.js` and `node --check js/main.js`.
