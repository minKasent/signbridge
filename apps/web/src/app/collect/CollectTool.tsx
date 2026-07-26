import Link from "next/link";
import { Archive, BookOpen, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Trang thu mẫu dataset ĐÃ DỪNG.
 *
 * Vì sao giữ lại đường dẫn thay vì xoá hẳn: /collect từng được nhắc trong các bản
 * kế hoạch và ghi chú trước đó, xoá route sẽ làm hỏng những liên kết đó. Nội dung
 * cũ (215 dòng, nạp MediaPipe ~13MB WASM cho một tính năng không còn dùng) đã gỡ.
 *
 * Vì sao dừng: hướng tự quay dữ liệu huấn luyện đòi hỏi người thành thạo ký hiệu
 * ngồi quay hàng trăm lượt — vượt quá phạm vi đồ án. Thay vào đó dùng kho clip sẵn
 * có của Từ điển Ngôn ngữ Ký hiệu quốc gia (QIPEDC) và các bộ dữ liệu đã công bố.
 * Backend module `dataset` GIỮ NGUYÊN — API và test tích hợp E2E vẫn dùng.
 */

export default function CollectTool() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Card className="items-center gap-4 p-8 text-center">
        <Archive className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-bold tracking-tight">Tính năng thu mẫu đã dừng</h1>
        <p className="text-muted-foreground">
          Hướng tự quay dữ liệu huấn luyện cần người thành thạo ký hiệu quay hàng trăm lượt,
          vượt quá phạm vi đồ án. Hệ thống chuyển sang dùng kho clip của Từ điển Ngôn ngữ Ký
          hiệu quốc gia và các bộ dữ liệu đã công bố.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild>
            <Link href="/dictionary">
              <BookOpen className="size-4" aria-hidden />
              Tra cứu từ điển ký hiệu
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/record">
              <Video className="size-4" aria-hidden />
              Quay clip cho từ còn thiếu
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
