import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Public, Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { CreateShortcutDto, UpdateShortcutDto } from './dto';
import { SHORTCUTS_SERVICE, ShortcutsService } from './shortcuts.service';

/** Khách xem các ô tròn lối tắt ở trang chủ (không cần đăng nhập). */
@Public()
@Controller('public/shortcuts')
class PublicShortcutsController {
  constructor(@Inject(ShortcutsService) private readonly shortcuts: ShortcutsService) {}

  @Get()
  list() {
    return this.shortcuts.listPublic();
  }
}

// ADMIN: CRUD ô lối tắt.
const ShortcutsAdminCrud = createCrudController({
  path: 'shortcuts', service: SHORTCUTS_SERVICE, createDto: CreateShortcutDto, updateDto: UpdateShortcutDto, decorators: [Roles('ADMIN')],
});

@Module({
  controllers: [PublicShortcutsController, ShortcutsAdminCrud as never],
  providers: [ShortcutsService, { provide: SHORTCUTS_SERVICE, useExisting: ShortcutsService }],
})
export class ShortcutsModule {}
