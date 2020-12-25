/**
 * amqp
 */

/* Node modules */

/* Third-party modules */
import { Container, create_container, EventContext, Message } from 'rhea';
import { Logger } from 'pino';

/* Files */
import { IAMQP, IAMQPConfig, IAMQPHealth, IOpenFaaS } from './interfaces';

export default class AMQP implements IAMQP {
  private connectionHealth: IAMQPHealth = {
    receiver: false,
    sender: false,
  };

  private container: Container;

  /* Used to send replies */
  private sender: EventContext | undefined;

  constructor(private config: IAMQPConfig, private logger: Logger, private openfaas: IOpenFaaS) {
    this.container = create_container();

    this.configureListeners();
    this.startListening();
  }

  connectionStatus(): IAMQPHealth {
    return this.connectionHealth;
  }

  protected configureListeners() {
    this.container
      .on('accepted', () => {
        this.logger.debug('Message accepted');
      })
      .on('connection_close', () => {
        this.logger.warn('Connection closed');
      })
      .on('connection_error', (ctx) => {
        this.logger.error({ ctx }, 'Connection error');
      })
      .on('connection_open', () => {
        this.logger.debug('Connection open');
      })
      .on('disconnected', ({ error }) => {
        this.logger.fatal({ err: error }, 'AMQP connection disconnected');
        this.connectionHealth.sender = false;
        this.connectionHealth.receiver = false;
      })
      .on('error', (err) => {
        this.logger.error(
          {
            err: {
              message: err.message,
            },
          },
          'AMQP general error',
        );
      })
      .on('message', (ctx: EventContext) => this.processNewMessage(ctx))
      .on('protocol_error', (ctx) => {
        this.logger.error({ ctx }, 'Protocol error');
      })
      .on('receiver_open', () => {
        this.logger.info('Receiver open');

        this.connectionHealth.receiver = true;
      })
      .on('receiver_close', () => {
        this.logger.debug('Receiver closed');
        this.connectionHealth.receiver = false;
      })
      .on('receiver_error', ({ error }) => {
        this.logger.error({ err: error }, 'Receiver error');
        this.connectionHealth.receiver = false;
      })
      .on('sendable', (ctx) => {
        this.sender = ctx;
        this.connectionHealth.sender = true;
        this.logger.info('Reply queue now sendable');
      })
      .on('sender_close', () => {
        this.logger.debug('Sender closed');
        this.connectionHealth.sender = false;
      })
      .on('sender_error', ({ error }) => {
        this.logger.error({ err: error }, 'Sender error');
        this.connectionHealth.sender = false;
      });
  }

  protected async processNewMessage(ctx: EventContext): Promise<void> {
    const logger = this.logger.child({
      messageId: ctx.message.message_id,
      correlationId: ctx.message.correlation_id,
    });

    try {
      const message = AMQP.convertMessage(ctx.message);
      logger.info(
        {
          message,
          subject: ctx.message.subject,
          contentType: ctx.message.content_type,
          deliveryCount: ctx.message.delivery_count,
          created: ctx.message.creation_time,
        },
        'New message received',
      );

      const { contentType, data } = await this.openfaas.invoke(message);

      if (this.config.response.sendReply) {
        const replyMessage: Message = {
          content_type: contentType,
          body: data,
          correlation_id: ctx.message.correlation_id,
        };

        logger.info(
          {
            ...replyMessage,
            body: undefined,
          },
          'Sending reply to queue',
        );

        if (!this.sender) {
          logger.error('Queue is not sendable yet - requeuing');
          return;
        }

        this.sender.sender.send(replyMessage);
      }

      /* Acknowledge receipt - message will never be sent again */
      ctx.delivery.accept();

      logger.info('New message successfully processed');
    } catch (err) {
      logger.error({ message: err.message }, 'Message processing errored');

      if (ctx.message.delivery_count >= this.config.delivery.maxAttempts) {
        logger.error('Exceeded delivery attempts - rejecting');

        ctx.delivery.reject();
        return;
      }

      ctx.delivery.release({
        delivery_failed: true,
        message_annotations: {
          error: err.message,
        },
      });

      logger.info('Message released');
    }
  }

  private startListening(): void {
    const connection = this.container.connect(this.config.connection);
    connection.open_receiver(this.config.receiver);

    if (this.config.response.sendReply) {
      this.logger.debug({ queue: this.config.response.replyQueue }, 'Reply will be sent');
      connection.open_sender(this.config.response.replyQueue);
    } else {
      this.logger.debug('No reply will be sent');
    }
  }

  static convertMessage(message: Message): any {
    /* I don't like using instanceof, but can't think of a better way of doing it */
    const messageContent =
      message.body?.content instanceof Buffer ? message.body.content.toString() : message.body;

    let formattedMessage: any;
    switch (message.content_type) {
      case 'application/json':
        formattedMessage = JSON.parse(messageContent);
        break;

      default:
        // No formatting - store as normal
        formattedMessage = messageContent;
        break;
    }

    return formattedMessage;
  }
}
