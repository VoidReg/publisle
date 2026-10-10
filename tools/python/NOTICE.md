# Python citation processor evaluation

Decision recorded 2026-10-10 for finalization milestone M2c. No citation
processor or third-party citation source is vendored by this decision.

The candidate [citeproc-py](https://github.com/citeproc-py/citeproc-py)
depends on `lxml`, so adopting it would change the existing offline,
platform-independent Python distribution. Its upstream compatibility notes
also list year-suffix disambiguation and collapsing as missing. Those are
relevant to Publisle's built-in styles, so installing the package would not
by itself establish parity with citeproc-js. Its
[license](https://github.com/citeproc-py/citeproc-py/blob/master/LICENSE)
permits source/binary redistribution with retained notices and includes a
views disclaimer; any future vendoring must preserve the actual license text.

Use an in-repository, corpus-defined subset for the initial numeric and
author-date implementation. Keep it independent of TypeScript outputs at
runtime and introduce no new Python runtime dependency. Generate reviewed
expectations with the pinned citeproc-js implementation. Each expansion needs
cross-language fixtures and explicit unsupported behavior before widening the
claim. The initial implementation now covers the two built-in styles,
English/French terms, bounded author/year sorting and identical-author year
suffixes over the shared corpus. Arbitrary CSL XML, other locales, quotation
processing and general given-name/coauthor disambiguation remain unsupported.
The implemented claim and evidence are recorded in [the usage guide](README.md#independent-research-citations).

The maintenance tradeoff is explicit: subset code stays small and offline, but
Publisle owns its correctness and must resist general CSL feature growth without
fixtures. Reassess a processor dependency if the corpus grows beyond a tractable
subset. The existing vendored RFC 8785 wheel retains its own bundled notices.
