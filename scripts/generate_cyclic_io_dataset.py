#!/usr/bin/env python3
"""Generate cyclic IO synthetic datasets."""

from __future__ import annotations

import argparse
from pathlib import Path

from cyclic_io import generate_case_dataset


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="build_out/cyclic_io")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--seed", type=int, default=1001)
    parser.add_argument(
        "--case",
        action="append",
        dest="cases",
        default=[],
        help="case id to generate; repeatable. Defaults to all cases.",
    )
    args = parser.parse_args()

    cases = args.cases or ["case_a_sine_relay", "case_b_phase_shifted_io", "case_c_state_machine"]
    for index, case_id in enumerate(cases):
        generate_case_dataset(Path(args.out), case_id, args.count, args.seed + index * 100)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
