import * as amqp from 'amqplib';
import {
  EVENT_DEAD_LETTER_EXCHANGE, EVENT_EXCHANGE, EventEnvelope, EventType, isEventEnvelope, ServiceName,
} from '../contracts/events';
import type { EventPublisher, RelayLogger } from './outbox';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitMqOptions {
  url: string;
  serviceName: ServiceName;
  logger?: RelayLogger;
  /** Thời gian chờ giữa các lần thử kết nối lại (ms). */
  reconnectDelayMs?: number;
}

export interface SubscribeOptions {
  /** Tên queue bền, vd "affiliate.commission". Mỗi consumer group một queue. */
  queue: string;
  routingKeys: EventType[];
  handler: (event: EventEnvelope) => Promise<void>;
  /** Số message xử lý đồng thời. */
  prefetch?: number;
  /** Số lần thử tối đa trước khi chuyển sang dead-letter queue. */
  maxAttempts?: number;
  /** Chờ trước khi thử lại (ms), nhân theo số lần đã thử. */
  retryDelayMs?: number;
}

const ATTEMPT_HEADER = 'x-attempt';
const silent: RelayLogger = { log() {}, warn() {}, error() {} };

/**
 * Kết nối RabbitMQ: publish có xác nhận (publisher confirm) và subscribe với retry + dead-letter queue.
 * Tự kết nối lại khi mất kết nối và đăng ký lại các subscription.
 */
export class RabbitMqClient implements EventPublisher {
  private connection: Connection | null = null;
  private publishChannel: amqp.ConfirmChannel | null = null;
  private readonly subscriptions: SubscribeOptions[] = [];
  private closing = false;
  private connecting: Promise<void> | null = null;
  private readonly logger: RelayLogger;

  constructor(private readonly options: RabbitMqOptions) {
    this.logger = options.logger ?? silent;
  }

  /** Kết nối (thử lại tới khi được). */
  async connect(maxAttempts = 30): Promise<void> {
    if (this.connection) return;
    this.connecting ??= this.openWithRetry(maxAttempts).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async openWithRetry(maxAttempts: number): Promise<void> {
    const delay = this.options.reconnectDelayMs ?? 2000;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.open();
        return;
      } catch (err) {
        if (this.closing || attempt >= maxAttempts) throw err;
        this.logger.warn(`Kết nối RabbitMQ lỗi (lần ${attempt}): ${err instanceof Error ? err.message : err}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async open(): Promise<void> {
    const connection = await amqp.connect(this.options.url, { clientProperties: { connection_name: this.options.serviceName } });
    connection.on('error', (err: Error) => this.logger.warn(`RabbitMQ connection error: ${err.message}`));
    connection.on('close', () => {
      this.connection = null;
      this.publishChannel = null;
      if (this.closing) return;
      this.logger.warn('Mất kết nối RabbitMQ, đang kết nối lại');
      void this.connect().catch((e) => this.logger.error('Không kết nối lại được RabbitMQ', String(e)));
    });

    const ch = await connection.createConfirmChannel();
    await ch.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
    await ch.assertExchange(EVENT_DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
    this.connection = connection;
    this.publishChannel = ch;
    for (const sub of this.subscriptions) await this.startConsumer(sub);
    this.logger.log('Đã kết nối RabbitMQ');
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    const ch = this.publishChannel;
    if (!ch) throw new Error('Chưa kết nối RabbitMQ');
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        EVENT_EXCHANGE, envelope.type, Buffer.from(JSON.stringify(envelope)),
        {
          persistent: true, contentType: 'application/json', messageId: envelope.id, type: envelope.type,
          timestamp: Date.parse(envelope.occurredAt), appId: envelope.source,
          ...(envelope.correlationId ? { correlationId: envelope.correlationId } : {}),
        },
        (err) => (err ? reject(err) : resolve()), // chỉ resolve khi broker đã xác nhận ghi bền
      );
    });
  }

  async subscribe(options: SubscribeOptions): Promise<void> {
    this.subscriptions.push(options);
    if (this.connection) await this.startConsumer(options);
  }

  private async startConsumer(sub: SubscribeOptions): Promise<void> {
    const connection = this.connection;
    if (!connection) throw new Error('Chưa kết nối RabbitMQ');
    const ch = await connection.createChannel();
    const dlq = `${sub.queue}.dlq`;
    await ch.assertQueue(dlq, { durable: true });
    await ch.bindQueue(dlq, EVENT_DEAD_LETTER_EXCHANGE, sub.queue);
    await ch.assertQueue(sub.queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EVENT_DEAD_LETTER_EXCHANGE, 'x-dead-letter-routing-key': sub.queue },
    });
    for (const key of sub.routingKeys) await ch.bindQueue(sub.queue, EVENT_EXCHANGE, key);
    await ch.prefetch(sub.prefetch ?? 10);

    const maxAttempts = sub.maxAttempts ?? 3;
    const retryDelay = sub.retryDelayMs ?? 2000;

    await ch.consume(sub.queue, (msg) => {
      if (!msg) return;
      void this.handleMessage(ch, msg, sub, maxAttempts, retryDelay);
    });
  }

  private async handleMessage(
    ch: amqp.Channel, msg: amqp.ConsumeMessage, sub: SubscribeOptions, maxAttempts: number, retryDelay: number,
  ): Promise<void> {
    let envelope: EventEnvelope;
    try {
      const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
      if (!isEventEnvelope(parsed)) throw new Error('Không đúng định dạng phong bì sự kiện');
      envelope = parsed;
    } catch (err) {
      this.logger.error(`Message không đọc được, chuyển vào DLQ: ${err instanceof Error ? err.message : err}`);
      ch.nack(msg, false, false); // không thể xử lý được nên không thử lại
      return;
    }

    try {
      await sub.handler(envelope);
      ch.ack(msg);
    } catch (err) {
      const attempt = Number(msg.properties.headers?.[ATTEMPT_HEADER] ?? 1);
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt >= maxAttempts) {
        this.logger.error(`Xử lý ${envelope.type} (${envelope.id}) lỗi ${attempt} lần, chuyển vào DLQ: ${reason}`);
        ch.nack(msg, false, false);
        return;
      }
      this.logger.warn(`Xử lý ${envelope.type} (${envelope.id}) lỗi lần ${attempt}, thử lại sau ${retryDelay * attempt}ms: ${reason}`);
      // Đưa lại vào đúng queue sau một khoảng chờ; ack bản cũ để không kẹt prefetch.
      ch.ack(msg);
      setTimeout(() => {
        try {
          ch.sendToQueue(sub.queue, msg.content, {
            ...msg.properties, persistent: true, headers: { ...msg.properties.headers, [ATTEMPT_HEADER]: attempt + 1 },
          });
        } catch (e) {
          this.logger.error(`Không đưa lại được message ${envelope.id}`, String(e));
        }
      }, retryDelay * attempt);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    try { await this.publishChannel?.close(); } catch { /* đã đóng */ }
    try { await this.connection?.close(); } catch { /* đã đóng */ }
    this.connection = null;
    this.publishChannel = null;
  }
}
