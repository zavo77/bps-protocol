export interface HealthStatus {
  readonly service: "worker";
  readonly status: "ok";
  readonly timestamp: string;
}

export function getHealthStatus(now: Date = new Date()): HealthStatus {
  return {
    service: "worker",
    status: "ok",
    timestamp: now.toISOString(),
  };
}
