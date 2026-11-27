import { Controller, Get, HttpCode, Inject, Patch, Post, Req } from '@nestjs/common';
import { ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, Public, type AuthUser } from '@phucvi/shared-library/auth';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterCustomerDto, RegisterDto, UpdateProfileDto } from './dto';
import type { RequestContext } from './token.service';

const contextOf = (req: Request): RequestContext => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public() @Post('register')
  register(@ValidBody(RegisterDto) dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, contextOf(req));
  }

  /** Khách mua hàng đăng ký tài khoản (vai trò CUSTOMER). */
  @Public() @Post('register-customer')
  registerCustomer(@ValidBody(RegisterCustomerDto) dto: RegisterCustomerDto, @Req() req: Request) {
    return this.auth.registerCustomer(dto, contextOf(req));
  }

  @Public() @Post('login') @HttpCode(200)
  login(@ValidBody(LoginDto) dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, contextOf(req));
  }

  @Public() @Post('refresh') @HttpCode(200)
  refresh(@ValidBody(RefreshDto) dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto, contextOf(req));
  }

  @Public() @Post('logout') @HttpCode(200)
  logout(@ValidBody(RefreshDto) dto: RefreshDto) {
    return this.auth.logout(dto);
  }

  @Post('logout-all') @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @ValidBody(UpdateProfileDto) dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('change-password') @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @ValidBody(ChangePasswordDto) dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user.id, dto, contextOf(req));
  }
}
