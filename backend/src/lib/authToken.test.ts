import assert from "node:assert/strict";
import test from "node:test";
import { bearerTokenMatches } from "./authToken.js";

test("bearerTokenMatches accepts only the configured bearer token", () => {
  assert.equal(bearerTokenMatches("Bearer metrics-secret", "metrics-secret"), true);
  assert.equal(bearerTokenMatches("Bearer wrong-secret", "metrics-secret"), false);
  assert.equal(bearerTokenMatches(undefined, "metrics-secret"), false);
  assert.equal(bearerTokenMatches("metrics-secret", "metrics-secret"), false);
});
