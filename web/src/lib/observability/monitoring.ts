import { logger } from "@/lib/observability/logger";

type MonitoringEvent = {
  type: "metric" | "error";
  name: string;
  value?: number;
  context?: Record<string, unknown>;
  timestamp: string;
};

function getMonitoringWebhookUrl(): string | null {
  const url = process.env.MONITORING_WEBHOOK_URL;
  return url && url.trim() ? url.trim() : null;
}

async function sendMonitoringEvent(event: MonitoringEvent) {
  const webhookUrl = getMonitoringWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
  } catch (error) {
    logger.warn("Failed to send monitoring event", { error, eventType: event.type, eventName: event.name });
  }
}

export function recordMetric(name: string, value: number, context?: Record<string, unknown>) {
  logger.info("Metric", { name, value, ...context });
  void sendMonitoringEvent({
    type: "metric",
    name,
    value,
    context,
    timestamp: new Date().toISOString(),
  });
}

export function captureException(name: string, error: unknown, context?: Record<string, unknown>) {
  logger.error(name, { error, ...context });
  void sendMonitoringEvent({
    type: "error",
    name,
    context: {
      ...context,
      error: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error,
    },
    timestamp: new Date().toISOString(),
  });
}
