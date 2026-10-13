#!/bin/bash
# Turns xcodebuild / swift test logs into GitHub annotations: a run's log needs a login, its annotations do not.
# GitHub keeps 10 error annotations a step, so compile errors and failed assertions go first, then failed or lost tests.
# Usage: annotate-xc.sh LOG...
{
  grep -h -E "(^|: )error: |xcodebuild: error|Fatal error|unexpected exit" "$@" 2>/dev/null
  grep -h -i -E "test case .* failed|^\s+[A-Za-z]+Tests[/.][A-Za-z]+" "$@" 2>/dev/null
} | tr -d '\r' | awk '!seen[$0]++' | head -10 | sed -e 's/%/%25/g' | while IFS= read -r line; do
  printf '::error::%s\n' "${line:0:900}"
done
exit 0
