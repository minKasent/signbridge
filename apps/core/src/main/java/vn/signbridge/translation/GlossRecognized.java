package vn.signbridge.translation;

import java.time.Instant;

/**
 * Sự kiện miền: một ký hiệu vừa được nhận diện.
 * Các module khác (analytics, ...) lắng nghe qua @ApplicationModuleListener —
 * không nằm trên hot path độ trễ của phiên dịch.
 *
 * @param latencyMs thời gian từ lúc server nhận lô frame tới lúc gloss sẵn sàng gửi
 *                  về client (gồm cả vòng gọi ML service) — nguồn số liệu p50/p95
 *                  cho chương đánh giá của báo cáo.
 */
public record GlossRecognized(String sessionId, String gloss, double confidence, long latencyMs, Instant at) {
}
