/**
 * Unit tests for CreditManager
 * Tests credit logic without file I/O using mock CreditStateProvider
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngineConfig } from "../../../src/config/types";
import { CreditManager } from "../../../src/core/credits/CreditManager";
import type {
  CreditState,
  CreditStateProvider,
} from "../../../src/core/credits/CreditStateProvider";
import type { EngineId } from "../../../src/core/types";

// Mock CreditStateProvider for testing
class MockCreditStateProvider implements CreditStateProvider {
  private state: CreditState = {};
  private shouldThrowOnLoad = false;
  private shouldThrowOnSave = false;

  async loadState(): Promise<CreditState> {
    if (this.shouldThrowOnLoad) {
      throw new Error("Mock load error");
    }
    return { ...this.state };
  }

  async saveState(state: CreditState): Promise<void> {
    if (this.shouldThrowOnSave) {
      throw new Error("Mock save error");
    }
    this.state = { ...state };
  }

  async stateExists(): Promise<boolean> {
    return Object.keys(this.state).length > 0;
  }

  // Test helper methods
  setState(state: CreditState): void {
    this.state = { ...state };
  }

  getState(): CreditState {
    return { ...this.state };
  }

  setThrowOnLoad(shouldThrow: boolean): void {
    this.shouldThrowOnLoad = shouldThrow;
  }

  setThrowOnSave(shouldThrow: boolean): void {
    this.shouldThrowOnSave = shouldThrow;
  }
}

describe("CreditManager", () => {
  let provider: MockCreditStateProvider;
  let manager: CreditManager;
  const mockEngines: EngineConfig[] = [
    {
      id: "google" as EngineId,
      name: "Google",
      monthlyQuota: 100,
      creditCostPerSearch: 1,
    },
    {
      id: "bing" as EngineId,
      name: "Bing",
      monthlyQuota: 50,
      creditCostPerSearch: 2,
    },
    {
      id: "brave" as EngineId,
      name: "Brave",
      monthlyQuota: 200,
      creditCostPerSearch: 1,
    },
  ];

  beforeEach(() => {
    provider = new MockCreditStateProvider();
    manager = new CreditManager(mockEngines, provider);
  });

  afterEach(() => {
    // Clean up any timers or resources
  });

  describe("initialization", () => {
    test("should initialize with empty state", async () => {
      await manager.initialize();

      const snapshots = manager.listSnapshots();
      expect(snapshots).toHaveLength(3);
      expect(snapshots.every((s) => s.used === 0)).toBe(true);
      expect(snapshots.every((s) => s.remaining === s.quota)).toBe(true);
      expect(snapshots.every((s) => !s.isExhausted)).toBe(true);
    });

    test("should initialize with existing state", async () => {
      const existingState: CreditState = {
        google: { used: 25, lastReset: new Date().toISOString() },
        bing: { used: 10, lastReset: new Date().toISOString() },
      };
      provider.setState(existingState);

      await manager.initialize();

      const googleSnapshot = manager.getSnapshot("google" as EngineId);
      expect(googleSnapshot.used).toBe(25);
      expect(googleSnapshot.remaining).toBe(75);

      const bingSnapshot = manager.getSnapshot("bing" as EngineId);
      expect(bingSnapshot.used).toBe(10);
      expect(bingSnapshot.remaining).toBe(40);
    });

    test("should handle state provider load errors", async () => {
      provider.setThrowOnLoad(true);

      await expect(manager.initialize()).rejects.toThrow("Mock load error");
    });

    test("should reset credits on new month", async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const oldState: CreditState = {
        google: { used: 90, lastReset: lastMonth.toISOString() },
        bing: { used: 45, lastReset: lastMonth.toISOString() },
      };
      provider.setState(oldState);

      await manager.initialize();

      const googleSnapshot = manager.getSnapshot("google" as EngineId);
      expect(googleSnapshot.used).toBe(0);
      expect(googleSnapshot.remaining).toBe(100);

      const bingSnapshot = manager.getSnapshot("bing" as EngineId);
      expect(bingSnapshot.used).toBe(0);
      expect(bingSnapshot.remaining).toBe(50);
    });

    test("should not reset credits within same month", async () => {
      const thisMonth = new Date();

      const currentState: CreditState = {
        google: { used: 30, lastReset: thisMonth.toISOString() },
        bing: { used: 20, lastReset: thisMonth.toISOString() },
      };
      provider.setState(currentState);

      await manager.initialize();

      const googleSnapshot = manager.getSnapshot("google" as EngineId);
      expect(googleSnapshot.used).toBe(30);
      expect(googleSnapshot.remaining).toBe(70);

      const bingSnapshot = manager.getSnapshot("bing" as EngineId);
      expect(bingSnapshot.used).toBe(20);
      expect(bingSnapshot.remaining).toBe(30);
    });
  });

  describe("charge operations", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should charge credits successfully", () => {
      const result = manager.charge("google" as EngineId);

      expect(result).toBe(true);

      const snapshot = manager.getSnapshot("google" as EngineId);
      expect(snapshot.used).toBe(1);
      expect(snapshot.remaining).toBe(99);
      expect(snapshot.isExhausted).toBe(false);
    });

    test("should charge multiple credits", () => {
      manager.charge("google" as EngineId);
      manager.charge("google" as EngineId);
      manager.charge("google" as EngineId);

      const snapshot = manager.getSnapshot("google" as EngineId);
      expect(snapshot.used).toBe(3);
      expect(snapshot.remaining).toBe(97);
    });

    test("should reject charge when exhausted", () => {
      // Charge 100 credits (full quota)
      for (let i = 0; i < 100; i++) {
        const result = manager.charge("google" as EngineId);
        expect(result).toBe(true);
      }

      // Next charge should fail
      const result = manager.charge("google" as EngineId);
      expect(result).toBe(false);

      const snapshot = manager.getSnapshot("google" as EngineId);
      expect(snapshot.used).toBe(100);
      expect(snapshot.remaining).toBe(0);
      expect(snapshot.isExhausted).toBe(true);
    });

    test("should handle engines with different credit costs", () => {
      // Bing costs 2 credits per search
      const result1 = manager.charge("bing" as EngineId);
      expect(result1).toBe(true);

      let bingSnapshot = manager.getSnapshot("bing" as EngineId);
      expect(bingSnapshot.used).toBe(2);
      expect(bingSnapshot.remaining).toBe(48);

      // Charge 24 more searches (48 credits)
      for (let i = 0; i < 24; i++) {
        manager.charge("bing" as EngineId);
      }

      bingSnapshot = manager.getSnapshot("bing" as EngineId);
      expect(bingSnapshot.used).toBe(50);
      expect(bingSnapshot.remaining).toBe(0);
      expect(bingSnapshot.isExhausted).toBe(true);

      // Next charge should fail
      const result2 = manager.charge("bing" as EngineId);
      expect(result2).toBe(false);
    });

    test("should throw error for unknown engine", () => {
      expect(() => manager.charge("unknown" as EngineId)).toThrow("Unknown engine: unknown");
    });

    test("should throw error when no credit record exists", () => {
      // Create manager without initializing
      const freshManager = new CreditManager(mockEngines, provider);

      expect(() => freshManager.charge("google" as EngineId)).toThrow(
        "No credit record for engine: google",
      );
    });
  });

  describe("chargeAndSave operations", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should charge and save successfully", async () => {
      const result = await manager.chargeAndSave("google" as EngineId);

      expect(result).toBe(true);

      const savedState = provider.getState();
      expect(savedState.google.used).toBe(1);
    });

    test("should not save state when charge fails", async () => {
      // Exhaust the quota first
      for (let i = 0; i < 100; i++) {
        await manager.chargeAndSave("google" as EngineId);
      }

      const stateBeforeFailedCharge = provider.getState();

      // This charge should fail
      const result = await manager.chargeAndSave("google" as EngineId);
      expect(result).toBe(false);

      const stateAfterFailedCharge = provider.getState();
      expect(stateAfterFailedCharge).toEqual(stateBeforeFailedCharge);
    });

    test("should handle save errors", async () => {
      provider.setThrowOnSave(true);

      await expect(manager.chargeAndSave("google" as EngineId)).rejects.toThrow("Mock save error");
    });
  });

  describe("hasSufficientCredits", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should return true for engine with sufficient credits", () => {
      expect(manager.hasSufficientCredits("google" as EngineId)).toBe(true);
    });

    test("should return false for exhausted engine", () => {
      // Exhaust the quota
      for (let i = 0; i < 100; i++) {
        manager.charge("google" as EngineId);
      }

      expect(manager.hasSufficientCredits("google" as EngineId)).toBe(false);
    });

    test("should return true for engine with no usage record", () => {
      // Create manager without initializing to test no record case
      const _freshManager = new CreditManager(mockEngines, provider);

      expect(manager.hasSufficientCredits("brave" as EngineId)).toBe(true);
    });

    test("should return false for unknown engine", () => {
      expect(manager.hasSufficientCredits("unknown" as EngineId)).toBe(false);
    });
  });

  describe("getSnapshot", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should return correct snapshot for engine with usage", () => {
      manager.charge("google" as EngineId);
      manager.charge("google" as EngineId);

      const snapshot = manager.getSnapshot("google" as EngineId);

      expect(snapshot.engineId).toBe("google");
      expect(snapshot.quota).toBe(100);
      expect(snapshot.used).toBe(2);
      expect(snapshot.remaining).toBe(98);
      expect(snapshot.isExhausted).toBe(false);
    });

    test("should return correct snapshot for exhausted engine", () => {
      // Exhaust the quota
      for (let i = 0; i < 100; i++) {
        manager.charge("google" as EngineId);
      }

      const snapshot = manager.getSnapshot("google" as EngineId);

      expect(snapshot.used).toBe(100);
      expect(snapshot.remaining).toBe(0);
      expect(snapshot.isExhausted).toBe(true);
    });

    test("should return snapshot for engine without usage record", () => {
      const snapshot = manager.getSnapshot("brave" as EngineId);

      expect(snapshot.engineId).toBe("brave");
      expect(snapshot.quota).toBe(200);
      expect(snapshot.used).toBe(0);
      expect(snapshot.remaining).toBe(200);
      expect(snapshot.isExhausted).toBe(false);
    });

    test("should throw error for unknown engine", () => {
      expect(() => manager.getSnapshot("unknown" as EngineId)).toThrow("Unknown engine: unknown");
    });
  });

  describe("listSnapshots", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should return snapshots for all engines", () => {
      const snapshots = manager.listSnapshots();

      expect(snapshots).toHaveLength(3);
      expect(snapshots.map((s) => s.engineId).sort()).toEqual(["bing", "brave", "google"]);
    });

    test("should return updated snapshots after usage", () => {
      manager.charge("google" as EngineId);
      manager.charge("bing" as EngineId);

      const snapshots = manager.listSnapshots();

      const googleSnapshot = snapshots.find((s) => s.engineId === "google");
      expect(googleSnapshot?.used).toBe(1);

      const bingSnapshot = snapshots.find((s) => s.engineId === "bing");
      expect(bingSnapshot?.used).toBe(2);
    });
  });

  describe("saveState", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test("should save current state", async () => {
      manager.charge("google" as EngineId);
      manager.charge("bing" as EngineId);

      await manager.saveState();

      const savedState = provider.getState();
      expect(savedState.google.used).toBe(1);
      expect(savedState.bing.used).toBe(2);
    });

    test("should handle save errors", async () => {
      provider.setThrowOnSave(true);

      await expect(manager.saveState()).rejects.toThrow("Mock save error");
    });
  });

  describe("edge cases and error handling", () => {
    test("should handle multiple engines with same credit cost", async () => {
      const enginesWithSameCost: EngineConfig[] = [
        {
          id: "engine1" as EngineId,
          name: "Engine 1",
          monthlyQuota: 100,
          creditCostPerSearch: 1,
        },
        {
          id: "engine2" as EngineId,
          name: "Engine 2",
          monthlyQuota: 150,
          creditCostPerSearch: 1,
        },
      ];

      const testManager = new CreditManager(enginesWithSameCost, provider);
      await testManager.initialize();

      testManager.charge("engine1" as EngineId);
      testManager.charge("engine2" as EngineId);

      const snapshot1 = testManager.getSnapshot("engine1" as EngineId);
      const snapshot2 = testManager.getSnapshot("engine2" as EngineId);

      expect(snapshot1.used).toBe(1);
      expect(snapshot2.used).toBe(1);
      expect(snapshot1.remaining).toBe(99);
      expect(snapshot2.remaining).toBe(149);
    });

    test("should handle zero quota engines", async () => {
      const zeroQuotaEngines: EngineConfig[] = [
        {
          id: "zeroQuota" as EngineId,
          name: "Zero Quota Engine",
          monthlyQuota: 0,
          creditCostPerSearch: 1,
        },
      ];

      const testManager = new CreditManager(zeroQuotaEngines, provider);
      await testManager.initialize();

      const result = testManager.charge("zeroQuota" as EngineId);
      expect(result).toBe(false);

      const snapshot = testManager.getSnapshot("zeroQuota" as EngineId);
      expect(snapshot.isExhausted).toBe(true);
      expect(snapshot.remaining).toBe(0);
    });

    test("should handle engines with zero credit cost", async () => {
      const freeEngines: EngineConfig[] = [
        {
          id: "free" as EngineId,
          name: "Free Engine",
          monthlyQuota: 100,
          creditCostPerSearch: 0,
        },
      ];

      const testManager = new CreditManager(freeEngines, provider);
      await testManager.initialize();

      // Should be able to charge indefinitely
      for (let i = 0; i < 1000; i++) {
        const result = testManager.charge("free" as EngineId);
        expect(result).toBe(true);
      }

      const snapshot = testManager.getSnapshot("free" as EngineId);
      expect(snapshot.used).toBe(0); // Zero cost means no usage recorded
      expect(snapshot.remaining).toBe(100);
      expect(snapshot.isExhausted).toBe(false);
    });
  });
});
