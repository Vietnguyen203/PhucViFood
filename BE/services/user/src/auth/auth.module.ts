import { Module } from '@nestjs/common';
import { createMailer, MAILER } from '@phucvi/shared-library/mail';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService, PasswordService, TokenService, PasswordResetService,
    { provide: MAILER, useFactory: (config: AppConfig) => createMailer(config.mail), inject: [APP_CONFIG] },
  ],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
