import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgressReporter } from "../progress";

describe("createProgressReporter", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("PlainProgressReporter (non-TTY)", () => {
    it("logs start with 0% initially", () => {
      const reporter = createProgressReporter(3);
      reporter.start("step-1", "Building");
      expect(consoleSpy).toHaveBeenCalledWith("  [0%] step-1: Building");
    });

    it("logs complete with incremented percentage", () => {
      const reporter = createProgressReporter(2);
      reporter.complete("step-1");
      expect(consoleSpy).toHaveBeenCalledWith("  [50%] step-1: done");
    });

    it("logs fail with FAIL prefix", () => {
      const reporter = createProgressReporter(2);
      reporter.fail("step-1", "something broke");
      expect(consoleSpy).toHaveBeenCalledWith("  [FAIL] step-1: something broke");
    });

    it("logs fail without error message", () => {
      const reporter = createProgressReporter(2);
      reporter.fail("step-1");
      expect(consoleSpy).toHaveBeenCalledWith("  [FAIL] step-1");
    });

    it("tracks progress through multiple steps", () => {
      const reporter = createProgressReporter(4);
      reporter.start("a", "first");
      reporter.complete("a");
      reporter.start("b", "second");
      reporter.complete("b");

      // After 2 of 4 completed, start should show 50%
      reporter.start("c", "third");
      expect(consoleSpy).toHaveBeenCalledWith("  [50%] c: third");
    });

    it("done is a no-op", () => {
      const reporter = createProgressReporter(1);
      reporter.done();
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
