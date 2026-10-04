#!/usr/bin/env bash
# Harvest subtitle-request fixtures for one title from the SubRanker host's
# journald logs. Prints a Fixture[] JSON array (metadata only — no subtitle
# content) to stdout. Run on the host (e.g. via SSM).
#
# Usage: harvest-fixtures.sh <imdbId> "<Name>"
#   harvest-fixtures.sh tt9335498 "Demon Slayer"
set -euo pipefail
IMDB="$1"
NAME="${2:-episode}"

sudo journalctl -u subranker --since "30 days ago" --no-pager \
  | grep -oE "/subtitles/series/${IMDB}%3A[0-9]+%3A[0-9]+/[^\"]+\.json" \
  | sort -u \
  | NAME="$NAME" node -e '
    const rl = require("readline").createInterface({ input: process.stdin });
    const out = [];
    const seen = new Set();
    rl.on("line", (line) => {
      // /subtitles/series/<id>/<extras>.json  (extras order varies)
      const m = line.match(/series\/([^/]+)\/(.+)\.json$/);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (seen.has(id)) return; // first request per episode is enough
      const extras = m[2];
      const fnField = extras.split("&").find((p) => p.startsWith("filename="));
      if (!fnField) return;
      const filename = decodeURIComponent(fnField.slice("filename=".length));
      const size = extras.match(/videoSize=(\d+)/);
      const hash = extras.match(/videoHash=([0-9a-f]+)/);
      seen.add(id);
      out.push({
        label: `${process.env.NAME} ${id}`,
        id,
        filename,
        ...(size ? { videoSize: Number(size[1]) } : {}),
        ...(hash ? { videoHash: hash[1] } : {}),
        lang: "en",
        expectedRuntimeMax: 3000,
      });
    });
    rl.on("close", () => process.stdout.write(JSON.stringify(out, null, 2) + "\n"));
  '
