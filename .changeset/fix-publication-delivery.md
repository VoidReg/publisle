---
"@publisle/adapter-core": patch
"@publisle/template-sdk": patch
---

Reject control-obfuscated executable URLs, preserve HTML attributes during placement,
finish all island cleanups after host errors, and retry failed visible activation
on viewport re-entry. Omit empty publisher BibTeX bibliographies so documents without
references compile successfully.

Load Arabic and CJK shaping fonts only when the article uses those scripts,
reducing research compilation memory without changing text or tagging behavior.
