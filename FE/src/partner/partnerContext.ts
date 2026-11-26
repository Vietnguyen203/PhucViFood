import { useOutletContext } from "react-router";
import type { PartnerProfile } from "../lib/partner";

export interface PartnerContext { profile: PartnerProfile; reload: () => void }
/** Hồ sơ CTV đã duyệt (ACTIVE) do khung cấp cho các trang con. */
export const usePartner = () => useOutletContext<PartnerContext>();
