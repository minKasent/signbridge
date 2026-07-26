import { speakVietnamese, warmUpVoices } from "./speech";

/**
 * Đọc câu tiếng Việt bằng giọng NEURAL sinh sẵn, tự lùi về giọng trình duyệt.
 *
 * Vì sao cần: `speechSynthesis` đọc tiếng Việt rất máy móc, và nhiều máy Windows
 * KHÔNG cài giọng vi-VN nào — lúc bảo vệ mà máy phòng hội đồng thiếu giọng thì
 * phần "nói ra tiếng" mất hẳn. File mp3 sinh sẵn nằm trong `public/tts/` nên
 * phát được kể cả khi không có mạng.
 *
 * Sinh lại danh sách: `python tools/tts/pregenerate_tts.py`
 */

type Manifest = { voice: string; files: Record<string, string> };

let manifestPromise: Promise<Manifest | null> | null = null;
let dangPhat: HTMLAudioElement | null = null;

/** PHẢI khớp hàm chuan_hoa trong tools/tts/pregenerate_tts.py. */
function chuanHoa(text: string): string {
  return text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

function napManifest(): Promise<Manifest | null> {
  // Chỉ tải một lần cho cả phiên; hỏng thì nhớ luôn là hỏng để khỏi gọi lại mỗi câu.
  manifestPromise ??= fetch("/tts/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** Gọi sớm (lúc mount trang) để lần đọc đầu không phải chờ tải manifest. */
export function warmUpTts(): void {
  warmUpVoices();
  void napManifest();
}

/**
 * Đọc `text`. Có file sinh sẵn thì phát mp3, không thì dùng giọng trình duyệt.
 * Luôn cắt câu đang đọc dở trước khi đọc câu mới.
 */
export async function speakVietnameseNeural(text: string): Promise<"neural" | "browser"> {
  if (!text.trim()) return "browser";

  dungDoc();

  const manifest = await napManifest();
  const file = manifest?.files[chuanHoa(text)];
  if (!file) {
    speakVietnamese(text);
    return "browser";
  }

  try {
    const audio = new Audio(`/tts/${file}`);
    dangPhat = audio;
    await audio.play();
    return "neural";
  } catch {
    // Trình duyệt chặn tự phát khi chưa có tương tác người dùng, hoặc file hỏng
    dangPhat = null;
    speakVietnamese(text);
    return "browser";
  }
}

export function dungDoc(): void {
  if (dangPhat) {
    dangPhat.pause();
    dangPhat.currentTime = 0;
    dangPhat = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
