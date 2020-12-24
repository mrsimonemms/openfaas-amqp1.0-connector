/**
 * config
 */

/* Node modules */

/* Third-party modules */

/* Files */

const queueName = process.env.AMQP_QUEUE_NAME ?? 'openfaas';

export default {
  logger: {
    level: process.env.LOGGER_LEVEL ?? 'info',
    redact: ['config.amqp.connection.password', 'config.openfaas.password'],
  },
  openfaas: {
    async: process.env.OPENFAAS_ASYNC === 'true',
    callbackUrl: process.env.OPENFAAS_CALLBACK_URL,
    function: process.env.OPENFAAS_FUNCTION ?? queueName, // Default to same as exchange
    gateway: process.env.OPENFAAS_GATEWAY,
    password: process.env.OPENFAAS_PASSWORD,
    username: process.env.OPENFAAS_USERNAME,
  },
};
