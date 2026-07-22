export interface HealthStatus {
  readonly service: "indexer";
  readonly status: "ok";
  readonly timestamp: string;
}

export function getHealthStatus(now: Date = new Date()): HealthStatus {
  return {
    service: "indexer",
    status: "ok",
    timestamp: now.toISOString(),
  };
}
