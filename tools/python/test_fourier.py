"""Independent numerical replay; never imports the TypeScript model."""
import json
import math
from pathlib import Path
import unittest

class FourierReference(unittest.TestCase):
    def test_pinned_partial_sums(self):
        fixture = json.loads((Path(__file__).resolve().parents[2] / "examples/fourier-demo/fixtures/samples.json").read_text())
        self.assertEqual(fixture["tolerance"], 1e-12)
        for case in fixture["cases"]:
            with self.subTest(case=case):
                value = 4 / math.pi * math.fsum(math.sin((2 * k - 1) * case["x"]) / (2 * k - 1) for k in range(1, case["terms"] + 1))
                self.assertLessEqual(abs(value - case["expected"]), fixture["tolerance"])
