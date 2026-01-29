/**
 * Configuration Validator
 * Validates all required environment variables at application startup
 * Fails fast if any configuration is missing or invalid
 *
 * NOTE: This module MUST NOT import logger, as the logger depends on validated config.
 * Uses console.log for validation messages.
 */

/**
 * Configuration validation rules
 */
const validationRules = {
  // Server Configuration
  NODE_ENV: {
    required: true,
    validator: (value) => ['development', 'production', 'test'].includes(value?.toLowerCase()),
    errorMessage: 'NODE_ENV must be one of: development, production, test',
  },
  PORT: {
    required: true,
    validator: (value) => {
      const port = parseInt(value, 10);
      return !isNaN(port) && port > 0 && port <= 65535;
    },
    errorMessage: 'PORT must be a valid port number (1-65535)',
  },
  NAME: {
    required: true,
    validator: (value) => value && value.length > 0,
    errorMessage: 'NAME must be a non-empty string',
  },
  VERSION: {
    required: true,
    validator: (value) => value && /^\d+\.\d+\.\d+/.test(value),
    errorMessage: 'VERSION must be in semantic version format (e.g., 1.0.0)',
  },
  DAPR_HTTP_PORT: {
    required: false,
    validator: (value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535),
    errorMessage: 'DAPR_HTTP_PORT must be a valid port number (1-65535)',
  },
  DAPR_HOST: {
    required: false,
    validator: (value) => !value || (typeof value === 'string' && value.length > 0),
    errorMessage: 'DAPR_HOST must be a non-empty string',
  },
  DAPR_PUBSUB_NAME: {
    required: false,
    validator: (value) => !value || (typeof value === 'string' && value.length > 0),
    errorMessage: 'DAPR_PUBSUB_NAME must be a non-empty string',
  },
  DAPR_APP_ID: {
    required: false,
    validator: (value) => !value || (typeof value === 'string' && value.length > 0),
    errorMessage: 'DAPR_APP_ID must be a non-empty string',
  },
  LOG_LEVEL: {
    required: false,
    validator: (value) => {
      const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
      return validLevels.includes(value?.toLowerCase());
    },
    errorMessage: 'LOG_LEVEL must be one of: error, warn, info, http, verbose, debug, silly',
    default: 'info',
  },
  LOG_FORMAT: {
    required: false,
    validator: (value) => !value || ['json', 'console'].includes(value?.toLowerCase()),
    errorMessage: 'LOG_FORMAT must be either json or console',
    default: 'console',
  },
  LOG_TO_CONSOLE: {
    required: false,
    validator: (value) => ['true', 'false'].includes(value?.toLowerCase()),
    errorMessage: 'LOG_TO_CONSOLE must be true or false',
    default: 'true',
  },
  LOG_TO_FILE: {
    required: false,
    validator: (value) => ['true', 'false'].includes(value?.toLowerCase()),
    errorMessage: 'LOG_TO_FILE must be true or false',
    default: 'false',
  },
  LOG_FILE_PATH: {
    required: false,
    validator: (value) => !value || (value.length > 0 && value.includes('.')),
    errorMessage: 'LOG_FILE_PATH must be a valid file path with extension',
    default: './logs/review-service.log',
  },
};

/**
 * Validates all environment variables according to the rules
 * @throws {Error} - If any required variable is missing or invalid
 */
const validateConfig = () => {
  const errors = [];
  const warnings = [];

  console.log('[CONFIG] Validating environment configuration...');

  // Validate each rule
  for (const [key, rule] of Object.entries(validationRules)) {
    const value = process.env[key];

    // Check if required variable is missing
    if (rule.required && !value) {
      errors.push(`❌ ${key} is required but not set`);
      continue;
    }

    // Skip validation if value is not set and not required
    if (!value && !rule.required) {
      if (rule.default) {
        warnings.push(`⚠️  ${key} not set, using default: ${rule.default}`);
        process.env[key] = rule.default;
      }
      continue;
    }

    // Validate the value
    if (value && rule.validator && !rule.validator(value)) {
      errors.push(`❌ ${key}: ${rule.errorMessage}`);
      if (value.length > 100) {
        errors.push(`   Current value: ${value.substring(0, 100)}...`);
      } else {
        errors.push(`   Current value: ${value}`);
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach((warning) => console.warn(warning));
  }

  // If there are errors, log them and throw
  if (errors.length > 0) {
    console.error('[CONFIG] ❌ Configuration validation failed:');
    errors.forEach((error) => console.error(error));
    console.error('\n💡 Please check your .env file and ensure all required variables are set correctly.');
    throw new Error(`Configuration validation failed with ${errors.length} error(s)`);
  }

  console.log('[CONFIG] ✅ All required environment variables are valid');
};

export default validateConfig;
