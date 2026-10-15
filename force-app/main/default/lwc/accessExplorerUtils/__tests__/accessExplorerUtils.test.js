import {
  buildSetupUrl,
  debounce,
  ENTITY_TYPES,
  errorText,
  getEntityTypeLabel,
  getEntityTypePluralLabel,
  reduceErrors
} from "c/accessExplorerUtils";

describe("c-access-explorer-utils", () => {
  describe("buildSetupUrl", () => {
    it("builds setup URLs for each source type", () => {
      expect(buildSetupUrl("Profile", "00e000000000001AAA")).toBe(
        "/lightning/setup/EnhancedProfiles/page?address=%2F00e000000000001AAA"
      );
      expect(buildSetupUrl("PermissionSet", "0PS000000000001")).toBe(
        "/lightning/setup/PermSets/page?address=%2F0PS000000000001"
      );
      expect(buildSetupUrl("PermissionSetGroup", "0PG000000000001AAA")).toBe(
        "/lightning/setup/PermSetGroups/page?address=%2F0PG000000000001AAA"
      );
    });

    it("rejects unknown types and anything that is not a Salesforce id", () => {
      expect(buildSetupUrl("User", "005000000000001AAA")).toBeNull();
      expect(
        buildSetupUrl("Profile", ["javascript", "alert(1)"].join(":"))
      ).toBeNull();
      expect(buildSetupUrl("Profile", "00e000000000001AAA/../x")).toBeNull();
      expect(buildSetupUrl("Profile", undefined)).toBeNull();
      expect(buildSetupUrl("Profile", 12345)).toBeNull();
    });
  });

  describe("debounce", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("only invokes the function after the wait with the latest arguments", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      debounced("a");
      debounced("b");
      jest.advanceTimersByTime(99);
      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("b");
    });
  });

  describe("reduceErrors / errorText", () => {
    it("handles Apex, LDS, JS and empty errors", () => {
      expect(reduceErrors({ body: { message: "Apex failed" } })).toEqual([
        "Apex failed"
      ]);
      expect(
        reduceErrors([
          { body: [{ message: "one" }, { message: "two" }] },
          new Error("js error"),
          { statusText: "Bad Request" },
          null
        ])
      ).toEqual(["one", "two", "js error", "Bad Request"]);
      expect(errorText(undefined)).toBe("An unexpected error occurred.");
      expect(errorText([{ body: { message: "a" } }, { message: "b" }])).toBe(
        "a b"
      );
    });
  });

  it("labels every entity type and falls back to the raw value", () => {
    ENTITY_TYPES.forEach((type) => {
      expect(getEntityTypeLabel(type.value)).toBe(type.label);
    });
    expect(getEntityTypeLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(getEntityTypePluralLabel("APEX_CLASS")).toBe("Apex Classes");
    expect(getEntityTypePluralLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
