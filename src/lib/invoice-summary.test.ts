import { describe, expect, it } from "vitest";
import { summariseSync } from "./invoice-summary";

/**
 * The one line the sync button prints. It is the only feedback a partner gets,
 * so "nothing happened" and "something happened" must not look alike.
 */
describe("summariseSync", () => {
  const result = (over: Partial<Parameters<typeof summariseSync>[0]> = {}) => ({
    imported: 0,
    skipped: 0,
    ...over,
  });

  it("says nothing is new when nothing is", () => {
    expect(summariseSync(result())).toBe("אין חשבוניות חדשות");
  });

  it("counts what was added", () => {
    expect(summariseSync(result({ imported: 2 }))).toBe("2 חשבוניות נוספו");
    expect(summariseSync(result({ imported: 5 }))).toBe("5 חשבוניות נוספו");
  });

  it("reads naturally for exactly one", () => {
    expect(summariseSync(result({ imported: 1 }))).toBe("חשבונית אחת נוספה");
  });

  it("mentions skips, so a silent refusal is not invisible", () => {
    // An invoice that could not be identified is not an error, but a partner
    // who is waiting for it should not be told "nothing new" and left there.
    expect(summariseSync(result({ skipped: 3 }))).toBe("אין חשבוניות חדשות (3 דולגו)");
  });

  it("leads with what was imported even when something was skipped", () => {
    expect(summariseSync(result({ imported: 1, skipped: 2 }))).toBe("חשבונית אחת נוספה");
  });
});
