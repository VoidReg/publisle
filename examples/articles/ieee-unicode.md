---
documentType: research-paper
title: "Multilingual Journal Export: العربية and 中文"
language: en
authors:
  - name: ليلى مثال
    affiliation: مختبر النشر
  - name: 王明
    affiliation: 示例研究所
subjects:
  - Unicode
  - العربية
  - 中文
---

:::heading{role="abstract"}

# Abstract

:::

This companion fixture checks multilingual names, Arabic shaping, Chinese glyphs and mathematical notation. It is a rendering test, not a research result.

# Mixed Scripts

English text before :dir[مرحبا بالعالم هذا اختبار للنشر العلمي]{dir="rtl"} and English after. Chinese text: 中文研究论文测试. Mathematical text symbols: α β ∑ ∞ ≤ ≥. Inline formula: $\alpha+\beta\leq\infty$.

$$
\int_0^{\infty}e^{-x}\,dx=1.
$$

Reference :cite[shannon1949] verifies the bibliography path in LuaLaTeX. Inspect the rendered Arabic visually and check that no glyph was substituted.

:::bibliography

```json
[
  {
    "id": "shannon1949",
    "type": "article-journal",
    "authors": ["Shannon, Claude E."],
    "title": "Communication in the Presence of Noise",
    "issued": "1949",
    "containerTitle": "Proceedings of the IRE",
    "volume": "37",
    "issue": "1",
    "page": "10--21",
    "doi": "10.1109/JRPROC.1949.232969",
    "url": "https://ieeexplore.ieee.org/document/1697831"
  }
]
```

:::
