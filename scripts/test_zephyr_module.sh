#!/bin/sh
set -eu

if [ "${1:-}" = "--metadata-only" ]; then
    test -f zephyr/module.yml
    test -f zephyr/Kconfig
    test -f zephyr/CMakeLists.txt
    grep -q 'name: dephy_ml_high_speed_implement' zephyr/module.yml
    exit 0
fi

echo "Only --metadata-only is supported for this initial module." >&2
exit 2

