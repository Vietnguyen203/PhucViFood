import { api } from './api';
import { createAdminAuth } from './admin/auth';
import { CUSTOMER_KEY } from './account';
import { safeStorage } from './storage';

/** Phiên của khách mua hàng đã đăng nhập (vai trò CUSTOMER): làm mới token tự động, dùng chung cho trang tài khoản và đặt hàng. */
export const customerAuth = createAdminAuth({ api, store: safeStorage(), role: 'CUSTOMER', sessionKey: CUSTOMER_KEY });
