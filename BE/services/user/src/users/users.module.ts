import { Module } from '@nestjs/common';
import { Roles } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { AuthModule } from '../auth/auth.module';
import { CreateUserDto, UpdateUserDto } from './dto';
import { USERS_SERVICE, UsersService } from './users.service';

const UsersController = createCrudController({
  path: 'users',
  service: USERS_SERVICE,
  createDto: CreateUserDto,
  updateDto: UpdateUserDto,
  // Không xóa cứng người dùng: dùng PATCH status=DISABLED để giữ lịch sử tham chiếu từ các service khác.
  routes: { remove: false },
  decorators: [Roles('ADMIN')],
});

@Module({
  imports: [AuthModule],
  controllers: [UsersController as never],
  providers: [UsersService, { provide: USERS_SERVICE, useExisting: UsersService }],
})
export class UsersModule {}
