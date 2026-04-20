/**
 * Observability module exports
 */

export { TracingManager, withSpan, getTracingManager, type TracingConfig } from './tracing.js';

export { MetricsCollector, getMetricsCollector, type MetricsConfig } from './metrics.js';

export {
  createLogger,
  createQueryLogger,
  logQueryStart,
  logQueryComplete,
  logQueryError,
  logIngestionStart,
  logIngestionComplete,
  logEvaluationResults,
  getLogger,
  type LogLevel,
  type LoggerConfig,
  type LogFields,
} from './logger.js';

export {
  getDashboardMetrics,
  updateDashboardMetrics,
  resetDashboardMetrics,
  calculateHealth,
  formatForDashboard,
  exportMetrics,
  type DashboardMetrics,
} from './dashboard.js';
