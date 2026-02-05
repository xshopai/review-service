/**
 * Unified OpenTelemetry tracing for Node.js services
 *
 * Supports multiple exporters based on OTEL_TRACES_EXPORTER environment variable:
 * - zipkin: Uses OTEL_EXPORTER_ZIPKIN_ENDPOINT
 * - otlp: Uses OTEL_EXPORTER_OTLP_ENDPOINT
 * - azure: Uses APPLICATIONINSIGHTS_CONNECTION_STRING
 * - none: Disables tracing
 *
 * This module should be imported at the very beginning of the application, before any other imports.
 */

import process from 'process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'unknown-service';
const exporterType = (process.env.OTEL_TRACES_EXPORTER || 'none').toLowerCase();

let sdk = null;
let tracingEnabled = false;

async function getExporter() {
  switch (exporterType) {
    case 'zipkin': {
      const endpoint = process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT;
      if (!endpoint) {
        console.log('⚠️  Zipkin exporter selected but OTEL_EXPORTER_ZIPKIN_ENDPOINT not set');
        return null;
      }
      const { ZipkinExporter } = await import('@opentelemetry/exporter-zipkin');
      console.log(`✅ Tracing: Zipkin exporter → ${endpoint}`);
      return new ZipkinExporter({ url: endpoint, serviceName });
    }

    case 'otlp': {
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      if (!endpoint) {
        console.log('⚠️  OTLP exporter selected but OTEL_EXPORTER_OTLP_ENDPOINT not set');
        return null;
      }
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      console.log(`✅ Tracing: OTLP exporter → ${endpoint}`);
      return new OTLPTraceExporter({ url: endpoint });
    }

    case 'azure': {
      const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
      if (!connectionString) {
        console.log('⚠️  Azure exporter selected but APPLICATIONINSIGHTS_CONNECTION_STRING not set');
        return null;
      }
      const { useAzureMonitor } = await import('@azure/monitor-opentelemetry');
      useAzureMonitor({
        azureMonitorExporterOptions: { connectionString },
      });
      console.log(`✅ Tracing: Azure Monitor configured for ${serviceName}`);
      return 'azure';
    }

    case 'none':
    default:
      console.log(`ℹ️  Tracing disabled (OTEL_TRACES_EXPORTER=${exporterType})`);
      return null;
  }
}

async function initializeTracing() {
  try {
    const exporter = await getExporter();

    if (exporter === null) {
      return false;
    }

    if (exporter === 'azure') {
      return true;
    }

    sdk = new NodeSDK({
      serviceName: serviceName,
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-mongodb': { enabled: true },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
        }),
      ],
    });

    sdk.start();

    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
    });

    return true;
  } catch (error) {
    console.error(`❌ Failed to initialize tracing: ${error.message}`);
    return false;
  }
}

tracingEnabled = await initializeTracing();

export { tracingEnabled, sdk };
