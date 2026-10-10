"""Generate the convergence figure for the interactive research paper demo.

Writes examples/articles/paper-convergence.png and prints the analytic
normalized mean-square error at the evaluated points, so the manuscript table
and the plotted curve come from the same computation.
"""

from __future__ import annotations

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ARTICLES = Path(__file__).resolve().parents[2] / "examples" / "articles"
EVALUATED = (1, 3, 7, 15)


def error(N: int) -> float:
    """Normalized mean-square error after retaining the first N odd harmonics."""
    retained = sum(1 / (2 * k + 1) ** 2 for k in range(N))
    return 1 - (8 / math.pi**2) * retained


def main() -> None:
    range_n = range(1, 41)
    values = [error(n) for n in range_n]

    for n in EVALUATED:
        print(f"N={n:>2}  E_N={error(n):.6f}")

    fig, axis = plt.subplots(figsize=(4.2, 3.1), dpi=200)
    axis.semilogy(list(range_n), values, marker="o", markersize=3.5, linewidth=1.2)
    marked = [error(n) for n in EVALUATED]
    axis.semilogy(list(EVALUATED), marked, marker="s", markersize=5, linestyle="none")
    for n, value in zip(EVALUATED, marked, strict=True):
        axis.annotate(f"N={n}", (n, value), textcoords="offset points", xytext=(6, -9), fontsize=7)
    axis.set_xlabel("Retained odd harmonics N")
    axis.set_ylabel(r"Normalized error $E_N$")
    axis.set_ylim(1e-3, 1)
    axis.grid(True, which="both", alpha=0.3)
    axis.unicode_minus = False
    fig.tight_layout()
    fig.savefig(ARTICLES / "paper-convergence.png")
    print(f"wrote {ARTICLES / 'paper-convergence.png'}")


if __name__ == "__main__":
    main()
