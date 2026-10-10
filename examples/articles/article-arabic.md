---
documentType: research-paper
title: "اختبار النشر العلمي وإتاحة المحتوى"
language: ar
direction: rtl
authors:
  - name: ليلى مثال
    affiliation: مختبر النشر العلمي
---

:::heading{role="abstract"}

# ملخص

:::

تختبر هذه الوثيقة تصدير مقالة عربية تتضمن معادلات وجدولا وشكلا ومراجع. وهي مثال للتحقق من إتاحة المحتوى وليست نتيجة بحثية جديدة.

# المقدمة

تساعد البنية الدلالية على حفظ العلاقات بين النص والمعادلات والجداول. يشير هذا المثال إلى مرجع علمي :cite[shannon1949] ويحتوي على حاشية توضيحية.[^note]

# النموذج الرياضي

تمثل المعادلة الأولى مجموعا منتهيا، وتعرض الثانية قيمة الخطأ.

$$
s_N(x)=\frac{4}{\pi}\sum_{k=0}^{N-1}\frac{\sin((2k+1)x)}{2k+1}.
$$

$$
E_N=1-\frac{8}{\pi^2}\sum_{k=0}^{N-1}\frac{1}{(2k+1)^2}.
$$

::::figure{src="ieee-square-wave.pdf" alt="موجة مربعة وتقريبها باستخدام خمسة عشر توافقا فرديا"}
:::caption
مثال توضيحي لتقريب موجة مربعة.
:::
::::

::::table{headerRows="1"}

| عدد التوافقيات | الخطأ    |
| -------------- | -------- |
| 1              | 0.189431 |
| 15             | 0.013504 |

:::caption
قيم توضيحية للخطأ مع زيادة عدد التوافقيات.
:::
::::

[^note]: الأسماء والمؤسسات في هذه الوثيقة أمثلة تخيلية.

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
    "page": "10--21"
  }
]
```

:::
