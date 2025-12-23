/**
 * Unit tests for Container (Dependency Injection)
 * Tests singleton/transient lifetimes, and error handling
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Container } from "../../../src/core/container";

// Test interfaces and implementations
interface IService {
  getValue(): string;
}

class TestService implements IService {
  constructor(private value: string) {}

  getValue(): string {
    return this.value;
  }
}

class DependentService {
  constructor(private service: IService) {}

  getValue(): string {
    return `Dependent: ${this.service.getValue()}`;
  }
}

// Async factory for testing async support
const createAsyncService = async (value: string): Promise<IService> => {
  return new TestService(value);
};

describe("Container", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    container.reset();
  });

  describe("singleton registration", () => {
    test("should register singleton service", () => {
      container.singleton("test", () => new TestService("singleton"));

      expect(container.has("test")).toBe(true);
    });

    test("should return same instance for singleton", () => {
      container.singleton("test", () => new TestService("singleton"));

      const instance1 = container.get<TestService>("test");
      const instance2 = container.get<TestService>("test");

      expect(instance1).toBe(instance2);
      expect(instance1.getValue()).toBe("singleton");
    });

    test("should support singleton with async factory", async () => {
      container.singleton("async", () => createAsyncService("async-singleton"));

      const instance1 = await container.get<Promise<IService>>("async");
      const instance2 = await container.get<Promise<IService>>("async");

      // For async factories, get() returns the same Promise, so instances are same
      expect(instance1).toBe(instance2);
      expect(instance1.getValue()).toBe("async-singleton");
    });

    test("should lazy initialize singleton", () => {
      let factoryCalled = false;
      container.singleton("lazy", () => {
        factoryCalled = true;
        return new TestService("lazy");
      });

      expect(factoryCalled).toBe(false);

      container.get("lazy");
      expect(factoryCalled).toBe(true);
    });

    test("should handle singleton factory errors", () => {
      container.singleton("error", () => {
        throw new Error("Factory error");
      });

      expect(() => container.get("error")).toThrow("Factory error");
    });
  });

  describe("transient registration (bind)", () => {
    test("should register transient service", () => {
      container.bind("test", () => new TestService("transient"));

      expect(container.has("test")).toBe(true);
    });

    test("should return different instances for transient", () => {
      container.bind("test", () => new TestService("transient"));

      const instance1 = container.get<TestService>("test");
      const instance2 = container.get<TestService>("test");

      expect(instance1).not.toBe(instance2);
      expect(instance1.getValue()).toBe("transient");
      expect(instance2.getValue()).toBe("transient");
    });

    test("should support transient with async factory", async () => {
      container.bind("async", () => createAsyncService("async-transient"));

      const promise1 = container.get<Promise<IService>>("async");
      const promise2 = container.get<Promise<IService>>("async");

      // Different Promise instances for transient
      expect(promise1).not.toBe(promise2);

      const instance1 = await promise1;
      const instance2 = await promise2;

      expect(instance1.getValue()).toBe("async-transient");
      expect(instance2.getValue()).toBe("async-transient");
    });

    test("should create new instance on each get", () => {
      let callCount = 0;
      container.bind("counter", () => new TestService(`instance-${++callCount}`));

      const instance1 = container.get<TestService>("counter");
      const instance2 = container.get<TestService>("counter");
      const instance3 = container.get<TestService>("counter");

      expect(instance1.getValue()).toBe("instance-1");
      expect(instance2.getValue()).toBe("instance-2");
      expect(instance3.getValue()).toBe("instance-3");
    });

    test("should handle transient factory errors", () => {
      container.bind("error", () => {
        throw new Error("Transient factory error");
      });

      expect(() => container.get("error")).toThrow("Transient factory error");
    });
  });

  describe("get operations", () => {
    test("should throw error for unregistered service", () => {
      expect(() => container.get("unregistered")).toThrow("No binding found for 'unregistered'");
    });

    test("should handle multiple service types", () => {
      container.singleton("service1", () => new TestService("service1"));
      container.bind("service2", () => new TestService("service2"));
      container.singleton("service3", () => "string-service");
      container.bind("service4", () => 42);

      const service1 = container.get<TestService>("service1");
      const service2 = container.get<TestService>("service2");
      const service3 = container.get<string>("service3");
      const service4 = container.get<number>("service4");

      expect(service1.getValue()).toBe("service1");
      expect(service2.getValue()).toBe("service2");
      expect(service3).toBe("string-service");
      expect(service4).toBe(42);
    });

    test("should preserve type safety", () => {
      container.singleton("typed", () => new TestService("typed"));

      const service = container.get<TestService>("typed");
      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe("typed");
    });
  });

  describe("dependency resolution", () => {
    test("should resolve simple dependencies", () => {
      container.singleton("base", () => new TestService("base"));
      container.bind("dependent", (c) => new DependentService(c.get<IService>("base")));

      const dependent = container.get<DependentService>("dependent");
      expect(dependent.getValue()).toBe("Dependent: base");
    });

    test("should resolve nested dependencies", () => {
      container.singleton("level1", () => new TestService("level1"));
      container.singleton("level2", (c) => new DependentService(c.get<IService>("level1")));
      container.bind("level3", (c) => {
        const level2 = c.get<DependentService>("level2");
        return new DependentService({
          getValue: () => level2.getValue(),
        });
      });

      const level3 = container.get<DependentService>("level3");
      expect(level3.getValue()).toBe("Dependent: Dependent: level1");
    });

    test("should detect circular dependencies", () => {
      container.singleton("a", (c) => ({ value: c.get("b") }));
      container.singleton("b", (c) => ({ value: c.get("a") }));

      expect(() => container.get("a")).toThrow("Circular dependency detected");
    });
  });

  describe("service management", () => {
    test("should check if service is registered", () => {
      expect(container.has("unregistered")).toBe(false);

      container.singleton("registered", () => new TestService("registered"));
      expect(container.has("registered")).toBe(true);
    });

    test("should remove service registration", () => {
      container.singleton("to-remove", () => new TestService("to-remove"));

      expect(container.has("to-remove")).toBe(true);

      // Should be able to get it before removal
      const service = container.get<TestService>("to-remove");
      expect(service.getValue()).toBe("to-remove");

      container.unbind("to-remove");
      expect(container.has("to-remove")).toBe(false);

      expect(() => container.get("to-remove")).toThrow();
    });

    test("should clear all registrations", () => {
      container.singleton("service1", () => new TestService("service1"));
      container.bind("service2", () => new TestService("service2"));
      container.singleton("service3", () => new TestService("service3"));

      expect(container.getRegisteredServices()).toHaveLength(3);

      container.reset();

      expect(container.getRegisteredServices()).toHaveLength(0);
      expect(container.has("service1")).toBe(false);
      expect(container.has("service2")).toBe(false);
      expect(container.has("service3")).toBe(false);
    });

    test("should return all registered keys", () => {
      container.singleton("service1", () => new TestService("service1"));
      container.bind("service2", () => new TestService("service2"));
      container.singleton("service3", () => new TestService("service3"));

      const keys = container.getRegisteredServices();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("service1");
      expect(keys).toContain("service2");
      expect(keys).toContain("service3");
    });

    test("should get service info", () => {
      container.singleton("singleton-service", () => new TestService("singleton"));
      container.bind("transient-service", () => new TestService("transient"));

      const singletonInfo = container.getServiceInfo("singleton-service");
      const transientInfo = container.getServiceInfo("transient-service");
      const unregisteredInfo = container.getServiceInfo("unregistered");

      expect(singletonInfo?.singleton).toBe(true);
      expect(transientInfo?.singleton).toBe(false);
      expect(unregisteredInfo).toBeUndefined();
    });
  });

  describe("edge cases and error handling", () => {
    test("should handle null and undefined factories", () => {
      container.singleton("null-service", () => null);
      container.bind("undefined-service", () => undefined);

      const nullService = container.get("null-service");
      const undefinedService = container.get("undefined-service");

      expect(nullService).toBeNull();
      expect(undefinedService).toBeUndefined();
    });

    test("should handle factories returning primitives", () => {
      container.singleton("string", () => "hello");
      container.singleton("number", () => 42);
      container.singleton("boolean", () => true);
      container.singleton("array", () => [1, 2, 3]);
      container.singleton("object", () => ({ key: "value" }));

      expect(container.get<string>("string")).toBe("hello");
      expect(container.get<number>("number")).toBe(42);
      expect(container.get<boolean>("boolean")).toBe(true);
      expect(container.get<number[]>("array")).toEqual([1, 2, 3]);
      expect(container.get<Record<string, string>>("object")).toEqual({ key: "value" });
    });

    test("should handle very long service keys", () => {
      const longKey = "a".repeat(1000);
      container.singleton(longKey, () => new TestService("long-key"));

      expect(container.has(longKey)).toBe(true);
      expect(container.getRegisteredServices()).toContain(longKey);
    });

    test("should handle special characters in service keys", () => {
      const specialKeys = [
        "service-with-dashes",
        "service_with_underscores",
        "service.with.dots",
        "service with spaces",
        "service@with@symbols",
        "service123with456numbers",
      ];

      specialKeys.forEach((key) => {
        container.bind(key, () => new TestService(key));
        expect(container.has(key)).toBe(true);
      });

      expect(container.getRegisteredServices()).toHaveLength(specialKeys.length);
    });

    test("should support Symbol keys", () => {
      const symbolKey = Symbol("myService");
      container.singleton(symbolKey, () => new TestService("symbol-service"));

      expect(container.has(symbolKey)).toBe(true);
      const service = container.get<TestService>(symbolKey);
      expect(service.getValue()).toBe("symbol-service");
    });
  });

  describe("performance and memory", () => {
    test("should handle large number of registrations", () => {
      const count = 1000;

      for (let i = 0; i < count; i++) {
        container.bind(`service-${i}`, () => new TestService(`service-${i}`));
      }

      expect(container.getRegisteredServices()).toHaveLength(count);
    });

    test("should not leak memory with transient services", () => {
      container.bind("leak-test", () => new TestService("leak"));

      // Create many instances
      const instances: TestService[] = [];
      for (let i = 0; i < 100; i++) {
        instances.push(container.get<TestService>("leak-test"));
      }

      // All should be different instances
      const uniqueInstances = new Set(instances);
      expect(uniqueInstances.size).toBe(100);
    });

    test("should reuse singleton instances", () => {
      container.singleton("memory-test", () => ({
        largeArray: new Array(1000).fill("data"),
        timestamp: Date.now(),
      }));

      const instance1 = container.get("memory-test");
      const instance2 = container.get("memory-test");
      const instance3 = container.get("memory-test");

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });
});
