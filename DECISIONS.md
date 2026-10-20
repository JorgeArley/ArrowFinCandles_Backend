# Implementation Plan: Candles Endpoint

## 1. Create a Plan for Later Execution

### Prompt 1: Plan the Endpoint Implementation

In the current project, create a plan to implement an endpoint like the following:

**Endpoint:**

`GET /candles?symbol=MES&tf=5m`

**Expected response structure:**

```json
{
  "symbol": "MES",
  "tf": "5m",
  "candles": [
    {
      "t": "2026-08-25T14:00:00Z",
      "o": 5635.75,
      "h": 5636.75,
      "l": 5627.5,
      "c": 5628.75,
      "v": 9940
    }
  ]
}
```

> **Important:** The values above are illustrative and only demonstrate the expected format. The actual values must be retrieved from the dataset.

Read the data in the `dataset/` directory and review the `README.md` file inside that directory to guide your implementation.

Follow these requirements:

1. **Load the data**
   - Read the JSON file from `dataset/` only once when the server starts.
   - Store the data in memory.
   - Do not read the file on every request.
   - Do not use a database.

2. **Validate the parameters**
   - Accept only the allowed symbols: `MES` and `NQ`.
   - Accept only the following timeframes: `1m`, `5m`, `15m`, and `1h`.

3. **Filter and clean the data**
   - Select the requested contract.
   - Handle duplicate rows in the dataset correctly.

4. **Aggregate the candles**
   - Apply the Open, High, Low, Close, and Volume (OHLCV) aggregation rules.
   - Respect the time boundaries of each aggregation interval.

5. **Sort and return the response**
   - Return candles from oldest to newest.
   - Use the JSON response structure specified above.

6. **Handle errors**
   - Return a clear error message when invalid parameters are provided.
   - Prevent validation or processing errors from crashing the server.
   - Ensure that `NaN` values are never returned.

#### Recommended Error Responses

| Case                                | Recommended HTTP Status                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Invalid symbol                      | `400 Bad Request`                                                       |
| Invalid timeframe                   | `400 Bad Request`                                                       |
| Data file cannot be read at startup | Log the error and prevent the service from starting as if it were ready |
| Unexpected server error             | `500 Internal Server Error`                                             |

#### Technical Decisions

1. Use `class-validator` together with `ValidationPipe` to validate input parameters.

---

### Prompt 2: Analyze and Handle Duplicate Records

The dataset contains duplicate rows, and a test is required to demonstrate that these duplicates do not change the result.

This means that simply aggregating the data is not enough. You must understand how to identify duplicate records and prevent the same candle from being counted twice.

**Example:**

If a candle has a volume of `100` and appears twice because of an exact duplicate, the aggregated volume must not become `200`.

Before implementing deduplication:

1. Review the dataset's `README.md` file.
2. Determine how duplicate records should be identified.
3. Define a deduplication strategy consistent with the structure and meaning of the data.
4. Do not automatically remove two rows that share the same timestamp if they represent legitimately different records.
5. Ensure that duplicate records do not affect the aggregation results.

#### Technical Decision

1. **Keep the most complete record and generate a warning.**

   This is the recommended strategy for handling duplicate records.

---

### Prompt 3: Implement the Plan

Implement the requirements defined in the previous plan.

Requirements:

1. Preserve the existing endpoint and parameter validation.
2. Refactor the architecture to follow **Clean Architecture** principles.
3. Maintain the expected endpoint behavior and response structure.
4. Remove the existing tests.

> **Note:** Removing the tests is part of the original instruction for this step. In the next step, two specific tests will be implemented again.

---

### Prompt 4: Implement Two Automated Tests

Implement the following tests:

1. **Candle Aggregation Test**
   - Verify that candle aggregation calculations are correct.
   - Validate the Open, High, Low, Close, and Volume (OHLCV) rules.
   - Ensure that aggregation intervals respect their time boundaries.

2. **Deduplication Test**
   - Demonstrate that duplicate rows in the dataset do not change the results.
   - Verify that an exact duplicate does not cause the volume to be counted twice.
   - Confirm that the deduplication strategy follows the rules defined in the dataset's `README.md` file.
