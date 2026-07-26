import {
  BarChart3,
  BookOpen,
  Clapperboard,
  Hand,
  MessagesSquare,
  Settings2,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Khai báo điều hướng TẬP TRUNG — sidebar, trang chủ và breadcrumb đều đọc từ đây,
 * thêm trang mới chỉ sửa một chỗ.
 *
 * `group` quyết định thứ bậc hiển thị: demo (thứ hội đồng xem) → công cụ → quản trị.
 */

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "demo" | "tool" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/translate",
    label: "Phiên dịch",
    description: "Bật webcam, ra ký hiệu và nghe câu tiếng Việt được đọc lên",
    icon: Hand,
    group: "demo",
  },
  {
    href: "/speak",
    label: "Nói → Ký hiệu",
    description: "Gõ hoặc nói tiếng Việt, hệ thống phát chuỗi clip ký hiệu tương ứng",
    icon: MessagesSquare,
    group: "demo",
  },
  {
    href: "/video",
    label: "Dịch từ video",
    description: "Chọn một file video có người ký hiệu, hệ thống dịch như xem người thật",
    icon: Clapperboard,
    group: "demo",
  },
  {
    href: "/dictionary",
    label: "Từ điển ký hiệu",
    description: "Tra cứu kho ký hiệu của Từ điển Ngôn ngữ Ký hiệu quốc gia",
    icon: BookOpen,
    group: "tool",
  },
  {
    href: "/stats",
    label: "Thống kê",
    description: "Số liệu sử dụng thật: lượt nhận diện theo ký hiệu và theo ngày",
    icon: BarChart3,
    group: "tool",
  },
  {
    href: "/record",
    label: "Quay clip",
    description: "Quay bổ sung clip cho những từ từ điển quốc gia còn thiếu",
    icon: Video,
    group: "admin",
  },
  {
    href: "/admin",
    label: "Quản trị từ điển",
    description: "Thêm, sửa, xóa ký hiệu và quản lý clip mẫu",
    icon: Settings2,
    group: "admin",
  },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  demo: "Phiên dịch",
  tool: "Tra cứu & Số liệu",
  admin: "Quản trị",
};

export const GROUP_ORDER: NavItem["group"][] = ["demo", "tool", "admin"];
