package vn.signbridge.translation;

import java.time.Instant;

/**
 * Sự kiện miền: một ký hiệu vừa được nhận diện.
 * Các module khác (analytics, ...) lắng nghe qua @ApplicationModuleListener —
 * không nằm trên hot path độ trễ của phiên dịch.
 */
public record GlossRecognized(String sessionId, String gloss, double confidence, Instant at) {
}
