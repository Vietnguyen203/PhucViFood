import { Controller, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import { createCrudController } from '@phucvi/shared-library/crud';
import { AuthModule } from '../auth/auth.module';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto';
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

@Controller('users')
@Roles('ADMIN')
class UserActionsController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Post(':id/reset-password') @HttpCode(200)
  resetPassword(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ValidBody(ResetPasswordDto) dto: ResetPasswordDto) {
    return this.users.resetPassword(admin.id, id, dto);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UsersController as never, UserActionsController],
  providers: [UsersService, { provide: USERS_SERVICE, useExisting: UsersService }],
})
export class UsersModule {}
