/**
 * Đọc câu tiếng Việt bằng SpeechSynthesis có sẵn trong trình duyệt.
 *
 * Đây là lựa chọn cho MVP: không key, không mạng, không phụ thuộc dịch vụ ngoài
 * (edge-tts từng bị Microsoft chặn 403). Bản nâng cấp dùng giọng neural
 * vi-VN-HoaiMyNeural sinh sẵn phía server là mục tiêu tuần 8.
 */

export function speakVietnamese(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = 0.95;

  const vietnameseVoice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang === "vi-VN" || v.lang.startsWith("vi"));
  if (vietnameseVoice) utterance.voice = vietnameseVoice;

  window.speechSynthesis.cancel(); // bỏ câu đang đọc dở
  window.speechSynthesis.speak(utterance);
}

/** Trình duyệt nạp danh sách giọng bất đồng bộ — gọi sớm để lần đọc đầu có giọng Việt. */
export function warmUpVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
}

export function hasVietnameseVoice(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.startsWith("vi"));
}
