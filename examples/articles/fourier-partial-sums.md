---
documentType: tutorial
title: "Square-wave partial sums"
description: "A host-owned finite Fourier sine series with authored presets, pinned samples, and a static table."
language: en
subjects:
  - Fourier analysis
license:
  name: Creative Commons Attribution 4.0 International
  identifier: CC-BY-4.0
  url: https://creativecommons.org/licenses/by/4.0/
---

# Square-wave partial sums

On the open interval from $-\pi$ to $\pi$, the square wave used here is $-1$ for negative $x$ and $1$ for positive $x$. Its Fourier sine series is $(4/\pi)$ times the sum of $\sin((2k-1)x)/(2k-1)$ for $k$ from 1 through $N$.

$N$ counts odd harmonics. The host evaluates that finite sum at authored sample positions. Publisle stores the payload and the explanation; it does not run the sum and it does not claim that a plotted pixel matches the number. The jump at multiples of $\pi$ stays discontinuous: every partial sum there is numerically $0$.

::::interactive{type="demo:fourier-partial-sum" schemaVersion="1" activation="interaction"}
:::title
Partial sums of the square wave
:::

:::description
Compare one, three, and fifteen odd harmonics. Away from the jumps, more harmonics follow the square wave more closely. Near the jumps, the overshoot remains.
:::

:::purpose
Show a reproducible partial sum, not a general Fourier solver.
:::

:::instructions
Choose a harmonic count with the buttons. The plot and the sample table update together. Keyboard users activate those buttons directly; there is no pointer-only control.
:::

:::fallback
With three odd harmonics, the partial sum at $\pi/2$ is 1.1034742721038078. At $x=\pi$ the sum is 0, which is the series value at the jump and not the square-wave value on either side. The table below is the static snapshot for that preset.
:::

```publisle-payload
{
  "terms": 3,
  "samples": 9,
  "presets": [
    { "id": "fundamental", "label": "One harmonic", "terms": 1 },
    { "id": "three", "label": "Three harmonics", "terms": 3 },
    { "id": "fifteen", "label": "Fifteen harmonics", "terms": 15 }
  ]
}
```

::::

## Static snapshot for three harmonics

These values are the host model's samples at the pinned positions, absolute tolerance $10^{-12}$. They are evidence for that implementation, not a proof that every host plot matches them.

| Position | Partial sum         |
| -------- | ------------------- |
| $-\pi/2$ | -1.1034742721038078 |
| $0$      | 0                   |
| $\pi/2$  | 1.1034742721038078  |
| $\pi$    | 0                   |

The illustrative scene and clock in the longer Fourier article are geometric and manual demonstrations. They do not evaluate this series.
