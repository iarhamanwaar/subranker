# AIOStreams preset

`subranker.ts` is the preset submitted to AIOStreams as
[Viren070/AIOStreams#1335](https://github.com/Viren070/AIOStreams/pull/1335).

It goes at `packages/core/src/presets/subranker.ts` in that repo, plus three
lines in `presetManager.ts` (an import, an entry in `PRESET_LIST`, and a case
in the `fromId` switch).

The copy here is kept so the option names stay in step with the config keys
this server accepts. If you add or rename a config key in `src/config-url.ts`,
this file needs the matching change.
