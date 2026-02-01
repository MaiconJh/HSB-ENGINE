import { EventBus } from "./event-bus.ts";
import { ModuleLoader } from "./module-loader.ts";
import { logger } from "./logger.ts";

type WatchdogPolicy = "WARN" | "CONTAIN" | "ISOLATE";

type WatchdogConfig = {
  defaultPolicy: WatchdogPolicy;
  modulePolicies?: Record<string, WatchdogPolicy>;
};

type ModuleStats = {
  signalRateViolations: number;
  invariantViolations: number;
  consecutiveBursts: number;
};

export class WatchdogCore {
  // Invariant: Kernel is the only authority that can stop/isolate modules automatically.
  private stats = new Map<string, ModuleStats>();
  private config: WatchdogConfig;
  private eventBus: EventBus;
  private moduleLoader: ModuleLoader;

  constructor(eventBus: EventBus, moduleLoader: ModuleLoader, config?: WatchdogConfig) {
    this.eventBus = eventBus;
    this.moduleLoader = moduleLoader;
    this.config = {
      defaultPolicy: config?.defaultPolicy ?? "WARN",
      modulePolicies: config?.modulePolicies ?? {},
    };
  }

  start(): void {
    this.eventBus.listen(
      "diagnostic:signal_rate",
      (payload) => {
        if (!payload || typeof payload !== "object") {
          return;
        }
        const source = (payload as { source?: string }).source;
        if (!source) {
          return;
        }
        const stat = this.getStats(source);
        stat.signalRateViolations += 1;
        stat.consecutiveBursts += 1;
        this.applyPolicy(source, "signal_rate", payload);
      },
      { source: "kernel" }
    );

    this.eventBus.listen(
      "diagnostic:event_storm",
      (payload) => {
        const stat = this.getStats("kernel");
        stat.consecutiveBursts += 1;
        this.applyPolicy("kernel", "event_storm", payload);
      },
      { source: "kernel" }
    );

    this.eventBus.listen(
      "diagnostic:schema_violation",
      (payload) => {
        const source = (payload as { source?: string }).source ?? "unknown";
        const stat = this.getStats(source);
        stat.invariantViolations += 1;
        this.applyPolicy(source, "schema_violation", payload);
      },
      { source: "kernel" }
    );

    this.eventBus.listen(
      "diagnostic:dispose_error",
      (payload) => {
        const moduleId = (payload as { moduleId?: string }).moduleId ?? "unknown";
        const stat = this.getStats(moduleId);
        stat.invariantViolations += 1;
        this.applyPolicy(moduleId, "dispose_error", payload);
      },
      { source: "kernel" }
    );
  }

  private getStats(moduleId: string): ModuleStats {
    const existing = this.stats.get(moduleId);
    if (existing) {
      return existing;
    }
    const initial: ModuleStats = {
      signalRateViolations: 0,
      invariantViolations: 0,
      consecutiveBursts: 0,
    };
    this.stats.set(moduleId, initial);
    return initial;
  }

  private applyPolicy(moduleId: string, reason: string, payload: unknown): void {
    const policy = this.config.modulePolicies?.[moduleId] ?? this.config.defaultPolicy;
    logger.warn("Watchdog policy evaluation", { moduleId, policy, reason });
    if (moduleId === "kernel") {
      this.eventBus.emit(
        "diagnostic:watchdog_warning",
        { moduleId, reason: "kernel_protected", payload: { reason, payload } },
        { source: "kernel" }
      );
      return;
    }
    if (policy === "WARN") {
      this.eventBus.emit(
        "diagnostic:watchdog_warning",
        { moduleId, reason, payload },
        { source: "kernel" }
      );
      return;
    }
    if (policy === "CONTAIN") {
      try {
        this.moduleLoader.stop(moduleId, `watchdog:${reason}`);
        this.eventBus.emit(
          "diagnostic:watchdog_contain",
          { moduleId, reason },
          { source: "kernel" }
        );
      } catch (error) {
        this.eventBus.emit(
          "diagnostic:watchdog_error",
          {
            moduleId,
            reason,
            error: error instanceof Error ? error.message : String(error),
          },
          { source: "kernel" }
        );
      }
      return;
    }
    if (policy === "ISOLATE") {
      try {
        this.moduleLoader.isolate(moduleId, `watchdog:${reason}`);
        this.eventBus.emit(
          "diagnostic:watchdog_isolate",
          { moduleId, reason },
          { source: "kernel" }
        );
      } catch (error) {
        this.eventBus.emit(
          "diagnostic:watchdog_error",
          {
            moduleId,
            reason,
            error: error instanceof Error ? error.message : String(error),
          },
          { source: "kernel" }
        );
      }
    }
  }
}
