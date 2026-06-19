import assert from "node:assert/strict";
import test from "node:test";
import { assertRedisPipelineSucceeded } from "./redis.js";

test("assertRedisPipelineSucceeded accepts successful command results", () => {
  assert.doesNotThrow(() => {
    assertRedisPipelineSucceeded(
      [
        [null, "OK"],
        [null, "1-0"]
      ],
      "test pipeline"
    );
  });
});

test("assertRedisPipelineSucceeded rejects missing and partial failure results", () => {
  assert.throws(() => assertRedisPipelineSucceeded(null, "test pipeline"), /returned no Redis pipeline results/);
  assert.throws(
    () =>
      assertRedisPipelineSucceeded(
        [
          [null, "OK"],
          [new Error("write failed"), null]
        ],
        "test pipeline"
      ),
    /failed for 1 Redis pipeline command/
  );
});
