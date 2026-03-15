import { describe, expect, it } from "vitest";

import { ServiceRegistry } from "../../src/core/service-registry.js";

describe("ServiceRegistry", () => {
  it("registers and retrieves services", () => {
    const registry = new ServiceRegistry();
    registry.register("logger", { info: () => undefined });
    const service = registry.get<{ info: () => void }>("logger");

    expect(service.info).toEqual(expect.any(Function));
  });

  it("throws on duplicate registration", () => {
    const registry = new ServiceRegistry();
    registry.register("logger", {});

    expect(() => registry.register("logger", {})).toThrow('Service "logger" is already registered');
  });

  it("throws when a service is missing", () => {
    const registry = new ServiceRegistry();
    expect(() => registry.get("missing")).toThrow('Service "missing" is not registered');
  });

  it("unregisters services", () => {
    const registry = new ServiceRegistry();
    registry.register("logger", {});
    registry.unregister("logger");

    expect(registry.has("logger")).toBe(false);
  });
});
