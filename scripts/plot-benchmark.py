"""Render only recorded observations. Optional authoring dependency: matplotlib."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parent.parent
data = json.loads((root / "docs/benchmarks/initial-local.json").read_text())
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "svg.fonttype": "none", "svg.hashsalt": "youtube-in-sync-v0.1"})
fig, axes = plt.subplots(1, 2, figsize=(11, 3.7), gridspec_kw={"width_ratios": [1.7, 1]}, layout="constrained")
for ax, values, title in zip(axes, [data["transient_error_ms"], data["settled_error_ms"]], ["Recovery after a 250 ms backward seek", "Later settled observations"]):
    ax.plot(range(1, len(values) + 1), values, "o-", color="#27615b", linewidth=2, markersize=5, label="Recorded timeline error")
    ax.axhline(60, color="#a45a1a", linestyle="--", linewidth=1, label="Start correcting: 60 ms")
    ax.axhline(25, color="#6b6b6b", linestyle=":", linewidth=1.4, label="Stop correcting: 25 ms")
    ax.set(title=title, xlabel="Recorded sample index", ylabel="Timeline error (ms)")
    ax.grid(axis="y", alpha=0.15)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_ylim(bottom=0, top=410 if ax is axes[0] else 85)
axes[0].legend(loc="upper right", fontsize=8, frameon=False)
axes[1].text(3.5, 32, "~24 ms in six rounded samples", ha="center", fontsize=9, color="#27615b")
fig.suptitle("Initial local smoke measurement — two Thorium profiles, one machine", fontsize=13)
destination = root / "docs/assets/initial-benchmark.svg"
destination.parent.mkdir(exist_ok=True)
fig.savefig(destination, metadata={"Date": None, "Description": "Recorded local media timeline errors; not speaker output latency or WAN performance."})
destination.write_text("\n".join(line.rstrip() for line in destination.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
(root / "output").mkdir(exist_ok=True)
fig.savefig(root / "output/benchmark-preview.png", dpi=150)
print(destination.relative_to(root))
