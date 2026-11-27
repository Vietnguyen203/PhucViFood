import { Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ParamTypes } from '@phucvi/shared-library/api';
import { Public, Roles } from '@phucvi/shared-library/auth';
import type { Request, Response } from 'express';
import { UploadsService } from './uploads.service';

/** ADMIN tải ảnh sản phẩm lên: thân yêu cầu là ảnh thô, header Content-Type là image/png, image/jpeg hoặc image/webp. */
@Roles('ADMIN')
@Controller('products/images')
export class ProductImagesController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post() @HttpCode(201) @ParamTypes(Object)
  upload(@Req() req: Request) {
    return this.uploads.save(req);
  }
}

/** Phục vụ ảnh đã tải lên (công khai, cache lâu vì tên tệp là UUID không đổi nội dung). */
@Public()
@Controller('public/uploads')
export class PublicUploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Get(':name') @ParamTypes(String, Object)
  async get(@Param('name') name: string, @Res() res: Response) {
    const { stream, size, contentType } = await this.uploads.open(name);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
