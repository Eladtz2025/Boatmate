import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

/**
 * `?next=` is attacker-controlled — it arrives from the address bar and ends up
 * in window.location.replace once sign-in completes. The protocol-relative cases
 * are the whole reason this function exists rather than a startsWith("/") test.
 */
describe("safeNext", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeNext("/finances")).toBe("/finances");
    expect(safeNext("/documents?alerts=1")).toBe("/documents?alerts=1");
    expect(safeNext("/")).toBe("/");
  });

  it("rejects protocol-relative URLs, which browsers treat as off-site", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/finances")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("rejects anything that is not a path at all", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("finances")).toBe("/");
  });
});
