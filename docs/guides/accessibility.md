# Accessibility

Publisle provides structural checks and accessible output mechanisms. These are
useful evidence for a review; they do not establish WCAG conformance for a host
website or guarantee that every authored equation or alternative is meaningful.

`accessibilityProfile()` version 2 checks document language (WCAG 3.1.1), heading
order (1.3.1 and 2.4.6), table captions (1.3.1), link names (2.4.4), and figure alt
text (1.1.1). Diagram alt text and embed titles are structural requirements.
Mathematics is a renderer contract: the static renderer supplies MathML or a text
alternative. The Research paper profile composes these checks.

## PDF export

| Template and engine                            | Tagging behavior                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `article`, `article-arabic`, LuaLaTeX          | Requests PDF/UA-2, with PDF 2.0, by default                                    |
| Standard article with `pdfUa: "ua-1"`          | Requests PDF/UA-1, with PDF 1.7 and associated MathML                          |
| IEEE and Elsevier starters                     | Untagged; `pdf-ua-unavailable` diagnostic pending class compatibility evidence |
| ACM and Springer starters, or pdfLaTeX article | Untagged; `pdf-ua-unavailable` diagnostic                                      |
| Any profile with `pdfUa: false`                | Explicit opt-out, with `pdf-ua-unavailable` diagnostic                         |

Use `createLatexPackage(document, { pdfUa: "ua-1" })` for the standard override.
The CLI accepts the same setting through `--template-data` with a JSON object
such as `{ "pdfUa": "ua-1" }`. Tagging requires a LaTeX format dated 2025-11-01 or
later. `publisle setup compiler` explicitly builds the frozen TeX Live 2025
recipe while registry publication is pending; an explicit `--image registry@sha256:...`
selects a published immutable image. Export never downloads a compiler. Auto selection rejects an older
native LaTeX for a tagged package and checks the installed container instead.
Run `publisle doctor --verapdf` to report compiler availability and an optional
local validator. A missing validator does not disable PDF export.

The source places `\DocumentMetadata` before the document class, propagates the
document language, supplies escaped figure alt text, and marks table header
rows locally for each table. Tagged exports reject blank figure alternatives and
invalid header row counts before compilation. Tables retain the Research
projection's default of one header row when the source does not specify a count.
LuaLaTeX uses OpenType fonts and `unicode-math`; UA-2 requests both associated
MathML files and MathML structure elements through LuaMML. Diagrams without a collected figure asset retain their authored alt/fallback
text with the existing `research-block-reduced` diagnostic. LuaMML conversion has
limits, so inspect complex mathematics with the intended assistive technology.
See the [LaTeX tagging instructions](https://latex3.github.io/tagging-project/documentation/usage-instructions.html).

The package's `pdfStandard` and the compiled manifest record the requested
standard. The manifest records `pdfUaValidation: "not-run"`: compiling a PDF is
separate from validating it. The export API does not claim to have run veraPDF.

## Validation evidence

CI builds the pinned compiler and runs `pnpm test:pdf-ua` over the English and
Arabic standard article templates for UA-2 and the English article for UA-1, including figures, a table, footnotes,
references, mixed scripts, and mathematics. The job installs veraPDF 1.28.2 from
a fixed URL with a checked SHA-256 digest. Reports and generated packages are
retained in the Research export artifact. The gate requires exactly one matching
compliant report for each PDF's requested profile, zero failed rules/checks, and zero parser/job
failures. Missing tools, empty reports, or compiler failures fail the job.

The three fixtures passed locally on 2026-10-10 with the frozen TL2025 compiler
and veraPDF 1.28.2, on the pinned amd64 image natively and on the arm64 image
(confirmed `linux/arm64` by inspect) under QEMU emulation; reports for the
artifacts persist beside each generated package as `verapdf-<standard>.xml`. The
gate also checks column-scoped table headers, formula and
figure structure, document language, associated MathML content, and Arabic/Chinese
text extraction. Included figure PDFs must also contain valid embedded glyphs:
the fixture generator uses ASCII minus signs because its separate Unicode-minus
font subset was reported as `.notdef` by veraPDF.

A compatibility spike on the same snapshot found that IEEEtran failed with
unbalanced tagpdf paragraph hooks. An elsarticle numeric fixture compiled and
passed UA-2; that single fixture does not establish compatibility for the other
class options or the author-date profile. Both shipped publisher profiles retain
their explicit unavailable diagnostic while the standard articles form the
supported tagging tier.

To repeat locally with Java, Docker, Python 3, and Poppler installed:

```sh
pnpm cli setup compiler
python3 tools/install-verapdf.py /tmp/publisle-verapdf
VERAPDF=/tmp/publisle-verapdf/verapdf pnpm test:pdf-ua
python3 tools/validate_pdf_ua.py manuscript.pdf --flavour ua2 --report verapdf-ua2.xml
```

For a UA-1 package, explicitly validate with `--flavour ua1`. veraPDF's [validation documentation](https://site.verapdf.org/cli/validation/)
explains the profiles and report fields. Its automated checks cannot judge the
quality of descriptions or guarantee a useful reading experience.

## Manual review

Review the final host page and exported PDF with the intended readers:

- Navigate every control with a keyboard; check focus visibility, order, cancellation, and return of focus.
- Check screen reader names, headings, language changes, table associations, mathematical speech, reading order, and announcements after interaction.
- Verify that figure and diagram alternatives explain the relevant information rather than repeat the caption.
- Respect reduced motion preferences and test pause/stop behavior for animation.
- Check zoom, reflow, contrast, print output, and meaningful fallback content with JavaScript disabled.
- Inspect Arabic shaping and right-to-left reading order visually and with assistive technology; text extraction alone is insufficient.

The publication artifact carries static document language/direction, image
alternatives, scoped table headers, and MathML. The host remains responsible for
page landmarks, navigation, control behavior, and its own accessibility claims.
