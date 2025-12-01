const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");

const INSTANCE_ID = process.env.INSTANCE_ID || "1";

// Prometheus exporter - expone metricas en puerto 9464
const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: "/metrics",
});

// Inicializar OpenTelemetry SDK
const sdk = new NodeSDK({
  serviceName: `todo-api-${INSTANCE_ID}`,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Desactivar instrumentacion de filesystem (muy verbose)
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

console.log(`[Instancia ${INSTANCE_ID}] OpenTelemetry inicializado. Metricas en :9464/metrics`);

// Shutdown graceful
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK cerrado"))
    .catch((err) => console.error("Error cerrando SDK", err))
    .finally(() => process.exit(0));
});
