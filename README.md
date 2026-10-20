# ArrowFin Candles Backend

OHLCV candles API over the `dataset/` dataset, built with [NestJS](https://nestjs.com/)
and organised with clean architecture.

- `GET /candles?symbol=MES&tf=5m` returns the candles for the requested contract and timeframe.
- The dataset is read **once at startup** and kept in memory: there is no database and
  no file read on every request.
- [DECISIONS.md](./DECISIONS.md) collects the design decisions (duplicate identity, bucket
  alignment, missing minutes, conflict policy).

---

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | >= 22 (tested on 24) | The test runner is `node:test`, native since Node 22 |
| npm | >= 10 | Dependencies |

Nothing else is needed: no database, no Docker and no mandatory environment variables.

---

## Running the project

### 1. Install the dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm run start        # compiles and starts (no watch)
npm run start:dev    # starts in watch mode: recompiles on save
npm run start:debug  # starts with the Node inspector (--debug --watch)
```

The server listens on `http://localhost:3000`. To use a different port:

```bash
PORT=8080 npm run start:dev
```

### 3. Production mode

```bash
npm run build        # compiles TypeScript into dist/
npm run start:prod   # runs dist/main.js
```

> `npm run build` deletes `dist/` before compiling, so `npm run start:prod` always serves
> freshly compiled code.

### 4. Check that it is up

```bash
curl "http://localhost:3000/candles?symbol=MES&tf=5m"
```

The startup log shows a summary of the load:

```
[JsonCandleRepository] Dataset loaded: 775 rows, 772 unique candles, 3 duplicates discarded, 0 conflicts
[NestApplication] Nest application successfully started
```

If the dataset cannot be read, the error is logged, the process exits with code `1` and
**does not open the port**: the service never becomes ready with corrupted data.

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DATASET_DIR` | automatic lookup | Dataset folder. When defined it is honoured exclusively: an invalid value is a startup error, not a reason to fall back to the default dataset |

```bash
# dataset stored somewhere else
DATASET_DIR=/srv/datasets/arrow-fin npm run start:prod

# or pointing straight at the dataset
DATASET_DIR=/srv/datasets/arrow-fin/dataset npm run start:prod
```

Without `DATASET_DIR`, the folder is found by walking up the directory tree from the file
itself, so it works the same whether it runs from `src/` or from `dist/`.

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run lint` | ESLint with auto-fix over `src/` and `tests/` |
| `npm run format` | Prettier over `src/` |
| `npm run build` | Compiles into `dist/` |

---

## Running the tests

```bash
npm test
```

It uses the native Node runner (`node --test`) with `ts-node` to compile the `.ts` files
on the fly: **there is no need to install jest or any test dependency**.

Expected output:

```
ℹ tests 35
ℹ suites 10
ℹ pass 35
ℹ fail 0
```

### Run a single file

```bash
node --test -r ts-node/register tests/aggregation.spec.ts
node --test -r ts-node/register tests/duplicates.spec.ts
```

### Run a single case by name

```bash
node --test -r ts-node/register --test-name-pattern="volume 100" tests/duplicates.spec.ts
```

### What each file covers

The tests live in `tests/` (outside `src/`, so they are not compiled into `dist/`) and only
touch the domain layer, which is pure: they need neither a database nor a running server.

| File | What it checks |
| --- | --- |
| `tests/aggregation.spec.ts` | That the aggregation calculations are correct: open/high/low/close/volume rules, time boundaries of each group, ordering, incomplete groups and expected values over the real dataset |
| `tests/duplicates.spec.ts` | That duplicate rows do not alter the result: the volume is not counted twice and the result is invariant to injecting and reordering duplicates |

Detail of `tests/aggregation.spec.ts`:

| Case | What it verifies |
| --- | --- |
| `open is the open of the first candle of the group` | `o` comes from the first candle |
| `close is the close of the last candle of the group` | `c` comes from the last candle |
| `high is the highest high of the group` | `h` is the maximum of the group |
| `low is the lowest low of the group` | `l` is the minimum of the group |
| `volume is the sum of the volumes of the group` | `v` sums the volumes |
| `groups minutes anchored to the UTC epoch` | 14:00 and 14:04 fall into the same group |
| `a candle at 14:05 opens the next group` | the group boundaries are correct |
| `the hourly group holds every minute of that hour` | 13:58 and 13:59 fall into `13:00` |
| `a group with missing minutes is aggregated with the minutes that exist` | no candles are invented |
| `never produces NaN nor Infinity` | no corrupted numeric value |
| `produces the expected number of candles on every timeframe` | 388/78/26/7 for MES and NQ |
| `aggregates the 14:00 group with the expected values` | `o:5635.75, h:5636.75, l:5627.5, c:5628.75, v:9940` |

Detail of `tests/duplicates.spec.ts`:

| Case | What it verifies |
| --- | --- |
| `a candle with volume 100 repeated does not produce a volume of 200` | the volume is not counted twice |
| `the result of <symbol> in <tf> does not change when duplicates are injected` | invariance across the 8 cases (MES and NQ on 1m/5m/15m/1h) |
| `resending the whole dataset does not change any aggregated volume` | the volume of every group is identical |
| `the result does not depend on the order the rows arrive in` | the order of the JSON does not alter the result |
| `the MES 14:10 group in 5m does not add up the resended minutes` | `v = 9896` and not `13635` |
| `they are not merged as duplicates and their volumes are not summed` | two rows of the same minute with a different OHLCV are not a duplicate |

---

## API

### `GET /candles`

| Parameter | Required | Accepted values | Example |
| --- | --- | --- | --- |
| `symbol` | yes | `MES`, `NQ` | `MES` |
| `tf` | yes | `1m`, `5m`, `15m`, `1h` | `5m` |

Values must be **exact**: `mes` in lowercase is rejected.

### Request examples

**MES candles in 5 minutes**

```bash
curl "http://localhost:3000/candles?symbol=MES&tf=5m"
```

```json
{
  "symbol": "MES",
  "tf": "5m",
  "candles": [
    {
      "t": "2026-08-25T13:30:00Z",
      "o": 5630,
      "h": 5635.25,
      "l": 5629.75,
      "c": 5635,
      "v": 13195
    },
    {
      "t": "2026-08-25T13:35:00Z",
      "o": 5635,
      "h": 5640.25,
      "l": 5634.25,
      "c": 5639,
      "v": 12212
    }
  ]
}
```

**NQ candles in 1 hour**

```bash
curl "http://localhost:3000/candles?symbol=NQ&tf=1h"
```

```json
{
  "symbol": "NQ",
  "tf": "1h",
  "candles": [
    {
      "t": "2026-08-25T13:00:00Z",
      "o": 19810,
      "h": 19831.75,
      "l": 19729.5,
      "c": 19737,
      "v": 27183
    }
  ]
}
```

**A single candle (with `jq`)**

```bash
curl -s "http://localhost:3000/candles?symbol=MES&tf=5m" \
  | jq '.candles[] | select(.t == "2026-08-25T14:00:00Z")'
```

```json
{
  "t": "2026-08-25T14:00:00Z",
  "o": 5635.75,
  "h": 5636.75,
  "l": 5627.5,
  "c": 5628.75,
  "v": 9940
}
```

**Summary without the candles**

```bash
curl -s "http://localhost:3000/candles?symbol=MES&tf=15m" \
  | jq '{symbol, tf, total: (.candles | length)}'
```

```json
{
  "symbol": "MES",
  "tf": "15m",
  "total": 26
}
```

**From JavaScript (Node 18+ or the browser)**

```js
const response = await fetch(
  'http://localhost:3000/candles?symbol=MES&tf=5m',
);
const { symbol, tf, candles } = await response.json();

console.log(symbol, tf, candles.length); // MES 5m 78
console.log(candles[0]); // { t: '2026-08-25T13:30:00Z', o: 5630, ... }
```

**From Python**

```python
import json
import urllib.request

with urllib.request.urlopen(
    "http://localhost:3000/candles?symbol=MES&tf=5m"
) as response:
    body = json.load(response)

print(body["symbol"], body["tf"], len(body["candles"]))  # MES 5m 78
```

**From Postman / Insomnia**

- Method: `GET`
- URL: `http://localhost:3000/candles`
- Query params: `symbol` = `MES`, `tf` = `5m`

### Response format

| Field | Meaning |
| --- | --- |
| `t` | Start of the group, ISO-8601 in UTC (`2026-08-25T14:00:00Z`) |
| `o` | Open: `open` of the first candle of the group |
| `h` | High: the highest `high` of the group |
| `l` | Low: the lowest `low` of the group |
| `c` | Close: `close` of the last candle of the group |
| `v` | Volume: sum of the volume of the **unique** candles of the group |

The candles come sorted from oldest to newest. The groups are anchored to the UTC epoch
(`14:00`, `14:05`, `14:10`…), so the hourly group of the session, which starts at `13:30`,
is labelled `13:00`.

Number of candles per combination:

| `tf` | MES | NQ |
| --- | --- | --- |
| `1m` | 388 | 384 |
| `5m` | 78 | 78 |
| `15m` | 26 | 26 |
| `1h` | 7 | 7 |

### Errors

| Request | Status | Body |
| --- | --- | --- |
| `?symbol=ABC&tf=5m` | `400` | `{ "statusCode": 400, "message": "symbol \"ABC\" must be one of the following values: MES, NQ", "error": "Bad Request" }` |
| `?symbol=MES&tf=2m` | `400` | `{ "statusCode": 400, "message": "tf \"2m\" must be one of the following values: 1m, 5m, 15m, 1h", "error": "Bad Request" }` |
| `?tf=5m` | `400` | `{ "message": "symbol should not be empty; symbol must be a string", "error": "Bad Request", "statusCode": 400 }` |
| (no parameters) | `400` | `{ "message": "symbol should not be empty; symbol must be a string; tf should not be empty; tf must be a string", ... }` |
| `?symbol=MES&tf=5m&foo=1` | `400` | `{ "message": "property foo should not exist", "error": "Bad Request", "statusCode": 400 }` |
| unexpected error | `500` | `{ "statusCode": 500, "message": "Internal server error" }` |

```bash
curl -i "http://localhost:3000/candles?symbol=ABC&tf=5m"
# HTTP/1.1 400 Bad Request
# {"statusCode":400,"message":"symbol \"ABC\" must be one of the following values: MES, NQ","error":"Bad Request"}
```

The business validation (which symbols and timeframes are supported) lives in the domain:
the HTTP DTO only checks that the parameters arrive as non-empty text. Business errors
(`ValidationError`) are translated into a `400` by the filter of the presentation layer.

---

## Architecture

Clean architecture with the dependency rule pointing inwards: the outer layers depend on
the inner ones, never the other way around.

```
src/
  domain/                          Core. Knows nothing about Nest or the filesystem.
    candles/
      candle.ts                    Entities: Candle, AggregatedCandle, CandlesResponse
      candle-repository.ts         Outbound port (CandleRepository)
      deduplicate-candles.ts       Domain service: duplicate identity
      aggregate-candles.ts         Domain service: timeframe grouping
      symbol.ts / timeframe.ts     Domain vocabulary and support rules
      errors.ts                    Business errors

  application/                     Use cases. Depend on the domain only.
    candles/
      get-candles.use-case.ts      GetCandlesUseCase

  infrastructure/                  Adapters implementing the ports.
    persistence/
      json-candle-repository.ts    Implements CandleRepository over the JSON
      dataset-paths.ts             Locating and reading the files

  presentation/                    HTTP input/output.
    http/
      candles.controller.ts        GET /candles
      dto/candles-query.dto.ts     Transport contract of the query
      filters/                     Translates domain errors into HTTP status codes
      pipes/                       Global ValidationPipe

  app.module.ts                    Composition root: this is where the pieces are wired
  main.ts                          Bootstrap
```

The rules that are respected:

- `domain` imports nothing from `application`, `infrastructure`, `presentation` or Nest.
- `application` only imports from `domain`.
- `infrastructure` implements the ports of the `domain`; it is the only layer that touches
  the disk.
- `presentation` translates HTTP into use case inputs, and business errors into HTTP
  status codes.

The detail of the design decisions is in [DECISIONS.md](./DECISIONS.md).

---

## Dataset

`dataset/` holds fabricated data for a single session: **2026-08-25, from 13:30 to 20:00
UTC**, with 1 minute candles for the `MES` and `NQ` contracts.

The format and its particularities (unsorted file, resent rows and minutes without a
candle) are described in [`dataset/README.md`](./dataset/README.md).

On startup 775 rows are read, which come down to **772 unique candles**: 3 rows are
identical resends of a candle already present and are discarded so their volume is not
counted twice.
