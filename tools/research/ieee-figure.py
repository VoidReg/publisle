"""Regenerate the illustrative IEEE fixture figure (requires NumPy/Matplotlib)."""
from pathlib import Path
import numpy as np
import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["pdf.fonttype"] = 42
# Keep tick labels in one embedded font subset. Matplotlib's separate Unicode
# minus subset maps its only glyph to CID 0, which veraPDF flags as .notdef.
matplotlib.rcParams["axes.unicode_minus"] = False
import matplotlib.pyplot as plt

x = np.linspace(-np.pi, np.pi, 2000)
y = sum(4 / np.pi * np.sin((2 * k + 1) * x) / (2 * k + 1) for k in range(15))
fig, ax = plt.subplots(figsize=(3.4, 2.2))
ax.plot(x, np.sign(x), color="black", linewidth=1, label="Square wave")
ax.plot(x, y, color="#1565c0", linewidth=.8, label="15 odd harmonics")
ax.set(xlabel="Phase x (radians)", ylabel="Amplitude", ylim=(-1.4, 1.4))
ax.legend(fontsize=7, loc="lower right")
ax.tick_params(labelsize=7)
fig.tight_layout(pad=.5)
output = Path(__file__).resolve().parents[2] / "examples/articles/ieee-square-wave.pdf"
fig.savefig(output, metadata={"CreationDate": None, "ModDate": None})
