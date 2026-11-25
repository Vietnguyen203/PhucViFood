import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ParamTypes, ValidBody } from '@phucvi/shared-library/api';
import { CurrentUser, InternalKeyGuard, Public, Roles, type AuthUser } from '@phucvi/shared-library/auth';
import type { Response } from 'express';
import { SegmentSettingsService } from '../settings/segment-settings.service';
import { ConsentDto, UpdateCustomerDto, UpdateSettingDto, UpsertCustomerDto } from './dto';
import { CustomersService } from './customers.service';
import { ExportLogsService, ExportService, XLSX_MIME } from './export.service';

/** API nội bộ cho ordering (cần header x-internal-key). */
@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/customers')
export class InternalCustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  /** Tìm hoặc tạo khách theo SĐT khi đặt hàng. Trả { id, phone, isNew }. */
  @Post('upsert') @HttpCode(200)
  upsert(@ValidBody(UpsertCustomerDto) dto: UpsertCustomerDto) {
    return this.customers.upsert(dto);
  }
}

/** Quản trị khách hàng. CHỈ ADMIN xem và xuất; CTV không có quyền với dữ liệu khách. */
@Roles('ADMIN')
@Controller('customers')
export class AdminCustomersController {
  constructor(
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(ExportService) private readonly exporter: ExportService,
    @Inject(ExportLogsService) private readonly exportLogs: ExportLogsService,
  ) {}

  /** Xuất Excel theo cùng bộ lọc với danh sách (bỏ phân trang). Có ghi nhật ký. Khai báo trước ':id'. */
  @Get('export') @ParamTypes(Object, Object, Object)
  async export(@CurrentUser() admin: AuthUser, @Query() query: Record<string, unknown>, @Res() res: Response) {
    const out = await this.exporter.export(query, admin.id);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.setHeader('X-Row-Count', String(out.rowCount));
    res.setHeader('X-Stats-Available', String(out.statsAvailable));
    res.setHeader('Cache-Control', 'no-store');
    res.end(out.buffer);
  }

  @Get('export-logs') @ParamTypes(Object)
  logs(@Query() query: Record<string, unknown>) {
    return this.exportLogs.list(query);
  }

  /**
   * Danh sách khách kèm phân loại tính khi truy vấn. Tham số: page, pageSize, q (tên, SĐT, email), sort
   * (createdAt, fullName, province, hoặc totalSpent, validOrders, lastOrderAt), filter[province], filter[firstAffiliateId],
   * filter[firstChannelCode], filter[marketingConsent], tier (NEW, RETURNING, VIP), activity (NONE, ACTIVE, AT_RISK, CHURNED).
   */
  @Get() @ParamTypes(Object)
  list(@Query() query: Record<string, unknown>) {
    return this.customers.list(query);
  }

  @Get(':id') @ParamTypes(String)
  detail(@Param('id') id: string) {
    return this.customers.detail(id);
  }

  @Patch(':id') @ParamTypes(String, Object)
  update(@Param('id') id: string, @ValidBody(UpdateCustomerDto) dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Post(':id/consent') @HttpCode(200) @ParamTypes(String, Object)
  consent(@Param('id') id: string, @ValidBody(ConsentDto) dto: ConsentDto) {
    return this.customers.setConsent(id, dto.consent);
  }
}

/** Ngưỡng phân loại khách (VIP, quen, hoạt động, sắp rời...). */
@Roles('ADMIN')
@Controller('customer-settings')
export class SettingsController {
  constructor(@Inject(SegmentSettingsService) private readonly settings: SegmentSettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Patch(':key') @ParamTypes(Object, String, Object)
  update(@CurrentUser() admin: AuthUser, @Param('key') key: string, @ValidBody(UpdateSettingDto) dto: UpdateSettingDto) {
    return this.settings.update(key, dto.value, admin.id);
  }
}
