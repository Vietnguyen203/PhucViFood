import {
  DynamicModule, Global, Inject, Injectable, InjectionToken, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown,
} from '@nestjs/common';
import type { ServiceName } from '../contracts/events';
import { Inbox } from './inbox';
import { OutboxEventInput, OutboxRelay, OutboxWriter, RelayOptions } from './outbox';
import { RabbitMqClient } from './rabbitmq';
import type { RawExecutor, TransactionalClient } from './sql';
import type { EventType } from '../contracts/events';

export const MESSAGING_OPTIONS = Symbol('MESSAGING_OPTIONS');
export const MESSAGING_PRISMA = Symbol('MESSAGING_PRISMA');
export const RABBITMQ_CLIENT = Symbol('RABBITMQ_CLIENT');

export interface MessagingModuleOptions {
  serviceName: ServiceName;
  rabbitUrl: string;
  /** Token provider của PrismaClient của service (đã đăng ký trong module). */
  prismaToken: InjectionToken;
  /** Các Postgres schema có bảng outbox_events (service commerce có 3: catalog, ordering, customer). */
  outboxSchemas: string[];
  /** Các schema có bảng inbox_events. */
  inboxSchemas?: string[];
  /** Tắt relay (vd trong test hoặc khi chạy tiến trình riêng). Mặc định bật. */
  relay?: RelayOptions & { enabled?: boolean };
}

/** Ghi sự kiện vào outbox của một schema, trong transaction của nghiệp vụ. */
@Injectable()
export class OutboxService {
  private readonly writers = new Map<string, OutboxWriter>();

  constructor(@Inject(MESSAGING_OPTIONS) options: MessagingModuleOptions) {
    for (const schema of options.outboxSchemas) this.writers.set(schema, new OutboxWriter({ schema }, options.serviceName));
  }

  add<T extends EventType>(schema: string, tx: RawExecutor, event: OutboxEventInput<T>) {
    const writer = this.writers.get(schema);
    if (!writer) throw new Error(`Schema "${schema}" chưa khai báo trong outboxSchemas`);
    return writer.add(tx, event);
  }
}

@Injectable()
export class InboxService {
  private readonly inboxes = new Map<string, Inbox>();

  constructor(@Inject(MESSAGING_OPTIONS) options: MessagingModuleOptions) {
    for (const schema of options.inboxSchemas ?? []) this.inboxes.set(schema, new Inbox({ schema }));
  }

  processOnce<R>(schema: string, tx: RawExecutor, messageId: string, consumer: string, handler: () => Promise<R>) {
    const inbox = this.inboxes.get(schema);
    if (!inbox) throw new Error(`Schema "${schema}" chưa khai báo trong inboxSchemas`);
    return inbox.processOnce(tx, messageId, consumer, handler);
  }
}

/** Kết nối RabbitMQ và chạy relay outbox theo vòng đời ứng dụng NestJS. */
@Injectable()
class MessagingLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Messaging');
  private relays: OutboxRelay[] = [];

  constructor(
    @Inject(MESSAGING_OPTIONS) private readonly options: MessagingModuleOptions,
    @Inject(MESSAGING_PRISMA) private readonly prisma: TransactionalClient,
    @Inject(RABBITMQ_CLIENT) private readonly rabbit: RabbitMqClient,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbit.connect();
    if (this.options.relay?.enabled === false) return;
    this.relays = this.options.outboxSchemas.map(
      (schema) => new OutboxRelay(this.prisma, { schema }, this.rabbit, this.options.relay, this.logger),
    );
    this.relays.forEach((r) => r.start());
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.relays.map((r) => r.stop()));
    await this.rabbit.close();
  }
}

@Global()
@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        { provide: MESSAGING_OPTIONS, useValue: options },
        { provide: MESSAGING_PRISMA, useExisting: options.prismaToken },
        {
          provide: RABBITMQ_CLIENT,
          useFactory: () => new RabbitMqClient({ url: options.rabbitUrl, serviceName: options.serviceName, logger: new Logger('RabbitMQ') }),
        },
        OutboxService,
        InboxService,
        MessagingLifecycle,
      ],
      exports: [OutboxService, InboxService, RABBITMQ_CLIENT],
    };
  }
}
