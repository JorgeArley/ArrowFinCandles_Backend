# Assessment Dataset

Everything here is fabricated.

All candles are from one trading session, **2026-08-25, 13:30 to 20:00 UTC**. Timestamps are UTC, in ISO 8601.

| File | What it holds |
| --- | --- |
| `instruments.json` | 2 contracts: `MES` and `NQ`. |
| `candles_1m.json` | 1 minute candles for both contracts. |

Each candle:

```json
{ "symbol": "MES", "ts": "2026-08-25T13:30:00Z", "open": 5630.00, "high": 5631.50, "low": 5629.25, "close": 5631.00, "volume": 1520 }
```

`ts` is the start of the minute. The candle covers `ts` up to, but not including, the next minute.

## Things that are true about this data

- `candles_1m.json` is not sorted by time or by symbol.
- Some rows appear twice. A duplicate is the same candle sent again, not extra trading.
- Some minutes have no row, because nothing traded in them.
