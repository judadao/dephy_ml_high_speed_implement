# Repository Guidelines

## Scope

This repository contains the bitmap animation generator module. Keep generation
logic reusable and product-neutral. IO-device simulator integration should enter
through explicit control structs or adapters, not product-specific code.

## Layout

- `include/dephy_ml_high_speed_implement/`: public animation API.
- `src/`: reusable C11 implementation.
- `tools/`: Linux command-line generators.
- `tests/`: focused C unit tests.
- `scripts/`: audit and integration scripts.
- `docs/`: design notes and TODO tracking.
- `zephyr/`: metadata stub to preserve the reusable module contract.

## Commands

- `make -f Makefile.linux` builds the static library and CLI.
- `make -f Makefile.linux test` runs unit, CLI smoke, structure, and metadata checks.
- `make -f Makefile.linux demo` generates a sample running animation into `build_out/demo_frames/`.
- `make -f Makefile.linux web` starts the local Three.js control sandbox.

## Style

Use C11, `-Wall -Wextra`, four-space indentation, snake_case identifiers, and
uppercase macros. Do not commit generated frames or build output.

For `web/`, keep the primary 3D scene immediately usable. Do not replace the
rig controls with a marketing page.

