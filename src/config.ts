/**
 * config
 */

/* Node modules */

/* Third-party modules */

/* Files */

export default {
  logger: {
    level: process.env.LOGGER_LEVEL ?? 'info',
    redact: ['config.amqp.connection.password', 'config.openfaas.password'],
  },
};
