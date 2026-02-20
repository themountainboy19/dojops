import { describe, it, expect, beforeEach } from "vitest";
import { HistoryStore } from "./store";

describe("HistoryStore", () => {
  let store: HistoryStore;

  beforeEach(() => {
    store = new HistoryStore();
  });

  it("assigns sequential ids", () => {
    const a = store.add({
      type: "generate",
      request: {},
      response: {},
      durationMs: 10,
      success: true,
    });
    const b = store.add({ type: "plan", request: {}, response: {}, durationMs: 20, success: true });
    expect(a.id).toBe("1");
    expect(b.id).toBe("2");
  });

  it("assigns timestamps on add", () => {
    const entry = store.add({
      type: "generate",
      request: {},
      response: {},
      durationMs: 10,
      success: true,
    });
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("getAll returns entries in reverse-chronological order", () => {
    store.add({ type: "generate", request: {}, response: {}, durationMs: 10, success: true });
    store.add({ type: "plan", request: {}, response: {}, durationMs: 20, success: true });
    store.add({ type: "diff", request: {}, response: {}, durationMs: 30, success: true });

    const all = store.getAll();
    expect(all[0].id).toBe("3");
    expect(all[1].id).toBe("2");
    expect(all[2].id).toBe("1");
  });

  it("getAll filters by type", () => {
    store.add({ type: "generate", request: {}, response: {}, durationMs: 10, success: true });
    store.add({ type: "plan", request: {}, response: {}, durationMs: 20, success: true });
    store.add({ type: "generate", request: {}, response: {}, durationMs: 30, success: true });

    const filtered = store.getAll({ type: "generate" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.type === "generate")).toBe(true);
  });

  it("getAll limits results", () => {
    store.add({ type: "generate", request: {}, response: {}, durationMs: 10, success: true });
    store.add({ type: "generate", request: {}, response: {}, durationMs: 20, success: true });
    store.add({ type: "generate", request: {}, response: {}, durationMs: 30, success: true });

    const limited = store.getAll({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("getById returns matching entry", () => {
    store.add({ type: "generate", request: {}, response: {}, durationMs: 10, success: true });
    const entry = store.getById("1");
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("generate");
  });

  it("getById returns undefined for missing id", () => {
    expect(store.getById("999")).toBeUndefined();
  });

  it("clear empties the store and resets ids", () => {
    store.add({ type: "generate", request: {}, response: {}, durationMs: 10, success: true });
    store.add({ type: "plan", request: {}, response: {}, durationMs: 20, success: true });
    store.clear();

    expect(store.getAll()).toHaveLength(0);

    const entry = store.add({
      type: "generate",
      request: {},
      response: {},
      durationMs: 10,
      success: true,
    });
    expect(entry.id).toBe("1");
  });
});
