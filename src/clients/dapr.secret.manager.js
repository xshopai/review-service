/**
 * Dapr Secret Management Service
 * Provides secret management using Dapr's secret store building block with ENV fallback.
 *
 * Priority Order:
 * 1. Dapr Secret Store (.dapr/secrets.json) - when running with Dapr
 * 2. Environment Variable (.env file) - when running without Dapr
 *
 * Secret Naming Convention:
 *   Local (.dapr/secrets.json): UPPER_SNAKE_CASE (e.g., JWT_SECRET)
 *   Azure Key Vault: lower-kebab-case (e.g., jwt-secret)
 *   The mapping is handled by Dapr component configuration in Azure.
 */

import { DaprClient } from '@dapr/dapr';
import logger from '../core/logger.js';

class DaprSecretManager {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.daprHost = process.env.DAPR_HOST || '127.0.0.1';
    this.daprPort = process.env.DAPR_HTTP_PORT || '3500';
    this.secretStoreName = 'secretstore';

    this.client = new DaprClient({
      daprHost: this.daprHost,
      daprPort: this.daprPort,
    });

    logger.info('Secret manager initialized', null, {
      event: 'secret_manager_init',
      daprEnabled: true,
      environment: this.environment,
      secretStore: this.secretStoreName,
    });
  }

  /**
   * Get a secret value from Dapr secret store
   * @param {string} secretName - Name of the secret to retrieve
   * @returns {Promise<string>} Secret value
   */
  async getSecret(secretName) {
    try {
      const response = await this.client.secret.get(this.secretStoreName, secretName);

      if (response && typeof response === 'object') {
        const value = response[secretName];
        if (value !== undefined && value !== null) {
          logger.debug('Retrieved secret from Dapr', null, {
            event: 'secret_retrieved',
            secretName,
            source: 'dapr',
          });
          return String(value);
        }

        const values = Object.values(response);
        if (values.length > 0 && values[0] !== undefined) {
          return String(values[0]);
        }
      }

      throw new Error(`Secret '${secretName}' not found in Dapr store`);
    } catch (error) {
      logger.debug(`Failed to get secret from Dapr: ${error.message}`, null, {
        event: 'secret_retrieval_error',
        secretName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a secret with Dapr first, ENV fallback
   * @param {string} secretName - Name of the secret
   * @returns {Promise<string>} Secret value
   */
  async getSecretWithFallback(secretName) {
    // Priority 1: Try Dapr secret store first
    try {
      const value = await this.getSecret(secretName);
      logger.debug(`${secretName} retrieved from Dapr secret store`, null, {
        secretName,
        source: 'dapr',
      });
      return value;
    } catch (error) {
      logger.debug(`${secretName} not in Dapr store, trying ENV variable`, null, {
        secretName,
        source: 'env_fallback',
      });

      // Priority 2: Fallback to environment variable (from .env file)
      const envValue = process.env[secretName];
      if (envValue) {
        logger.debug(`${secretName} retrieved from ENV variable`, null, {
          secretName,
          source: 'env',
        });
        return envValue;
      }

      throw new Error(`${secretName} not found in Dapr secret store or ENV variables`);
    }
  }

  /**
   * Get JWT configuration from Dapr secret store (preferred) or environment variables (fallback)
   *
   * Priority Order:
   * 1. Dapr Secret Store (.dapr/secrets.json) - when running with Dapr
   * 2. Environment Variable (.env file) - when running without Dapr
   *
   * @returns {Promise<Object>} JWT configuration parameters
   */
  async getJwtConfig() {
    const secret = await this.getSecretWithFallback('JWT_SECRET');

    return {
      secret,
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
      expiration: parseInt(process.env.JWT_EXPIRATION || '3600', 10),
      issuer: process.env.JWT_ISSUER || 'user-service',
      audience: process.env.JWT_AUDIENCE || 'xshopai-platform',
    };
  }

  /**
   * Get database configuration from Dapr secret store (preferred) or environment variables (fallback)
   * @returns {Promise<Object>} Database configuration parameters
   */
  async getDatabaseConfig() {
    const mongodbUri = await this.getSecretWithFallback('MONGODB_URI');

    return {
      uri: mongodbUri,
      dbName: process.env.MONGODB_DB_NAME || 'user_service_db',
    };
  }
}

// Global instance
export const secretManager = new DaprSecretManager();

// Helper functions for easy access
export const getJwtConfig = () => secretManager.getJwtConfig();
export const getDatabaseConfig = () => secretManager.getDatabaseConfig();
