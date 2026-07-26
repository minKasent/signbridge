"use client";

import { ClipRecorder } from "@/app/record/ClipRecorder";
import type { Sign } from "@/app/dictionary/sign";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Vỏ hộp thoại cho lõi quay clip dùng chung. Component này CHỈ được render khi
 * thật sự mở — mount là bật camera, unmount là tắt (cleanup của ClipRecorder),
 * nên không bao giờ có camera sáng đèn sau lưng một hộp thoại đã đóng.
 *
 * Dialog của shadcn lo sẵn role="dialog", aria-modal, bẫy focus và đóng bằng Escape.
 */

type Props = {
  sign: Sign;
  onClose: () => void;
  onUploaded: (updated: Sign) => void;
  onAuthError: () => void;
};

export default function RecordClipDialog({ sign, onClose, onUploaded, onAuthError }: Props) {
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quay clip cho “{sign.meaningVi}”</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{sign.gloss}</span>
            {sign.clipUrl !== null ? " · clip hiện tại sẽ bị thay thế" : " · ký hiệu này chưa có clip"}
          </DialogDescription>
        </DialogHeader>
        <ClipRecorder sign={sign} onUploaded={onUploaded} onAuthError={onAuthError} />
      </DialogContent>
    </Dialog>
  );
}
