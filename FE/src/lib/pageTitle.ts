import { useEffect } from 'react';

export const SITE_NAME = 'Phúc Vị Foods';

/** Tiêu đề thẻ trình duyệt: "{trang} | Phúc Vị Foods"; không có tên trang thì chỉ tên cửa hàng. */
export const formatTitle = (page?: string | null): string => (page?.trim() ? `${page.trim()} | ${SITE_NAME}` : `${SITE_NAME} - Đặc sản Việt giao tận nhà`);

/** Đặt tiêu đề thẻ trình duyệt theo trang đang xem (truyền undefined trong lúc chờ dữ liệu để giữ tiêu đề mặc định). */
export function useDocumentTitle(page?: string | null): void {
  useEffect(() => { document.title = formatTitle(page); }, [page]);
}
