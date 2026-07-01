#!/bin/sh
set -eu

repo="${1:-.}"

required="
AGENTS.md
CMakeLists.txt
Kconfig
Makefile.linux
README.md
VERSION
repo.json
include
src
tests
scripts
docs
zephyr/CMakeLists.txt
zephyr/Kconfig
zephyr/module.yml
"

for path in $required; do
    test -e "$repo/$path" || {
        echo "missing: $path" >&2
        exit 1
    }
done

find "$repo/include" -type f -name '*.h' | grep -q . || {
    echo "missing public header" >&2
    exit 1
}

find "$repo/tests" -type f -name 'unit_*.c' | grep -q . || {
    echo "missing unit test" >&2
    exit 1
}

