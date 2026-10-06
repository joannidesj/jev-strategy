import { describe, expect, it } from "vitest";
import { DecisionError } from "../src/index.js";

describe("DecisionError", () => {
  it("keeps its kind and is an Error", () => {
    const error = new DecisionError("transient", "timed out");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("transient");
    expect(error.message).toBe("timed out");
    expect(error.name).toBe("DecisionError");
  });
});
