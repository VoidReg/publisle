# @publisle/template-sdk

## 0.1.2

### Patch Changes

- 4342a8d: Reject control-obfuscated executable URLs, preserve HTML attributes during placement,
  finish all island cleanups after host errors, and retry failed visible activation
  on viewport re-entry. Omit empty publisher BibTeX bibliographies so documents without
  references compile successfully.

  Load Arabic and CJK shaping fonts only when the article uses those scripts,
  reducing research compilation memory without changing text or tagging behavior.

## 0.1.1

### Patch Changes

- e97d4d7: Allow compatible updates between independently versioned Publisle packages. Require Astro 7.2.8 or newer in the Astro adapter to resolve the reported security advisories. Astro 6 is no longer supported.
