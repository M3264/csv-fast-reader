# csv-fast-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/M3264/csv-fast-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/M3264/csv-fast-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every
CSV input exactly as the reference does (same `{columns, rows, errors}` for
every broken-row policy: BOM drop, LF/CRLF records, stray-CR drop, quoted
fields with `""` escapes and CR/CRLF-to-LF, `quote_junk` / `unterminated_quote`
recovery, `short_row` / `long_row` padding and cuts) but scans the text in
native-speed chunks (delimiter jumps via `indexOf`, slice-at-boundary fields,
single-pass line counting) instead of one character at a time — about 3-4x
faster on the practice set with byte-identical answers.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `cases.json` in the input dir, answers each
with `run()` from `solve.js`, and writes `answers.json` to the output dir.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mb0cqaeg&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
