package vn.signbridge.analytics;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import vn.signbridge.translation.GlossRecognized;

/**
 * Ghi nhận mỗi ký hiệu được nhận diện: đếm in-memory (log nhanh khi dev)
 * và lưu bản ghi {@link GlossUsage} làm số liệu thật cho dashboard /stats.
 * Listener async qua sự kiện — không nằm trên hot path độ trễ của phiên dịch.
 *
 * Nguồn sự kiện là WebSocket CÔNG KHAI (/ws/translate không cần đăng nhập), nên
 * mỗi phiên chỉ được ghi tối đa {@value #MAX_ROWS_PER_SESSION} dòng: không có
 * trần thì một script cắm socket chạy cả đêm sẽ phình bảng và bẻ cong số liệu
 * trên dashboard công khai. Bộ đếm in-memory vẫn tăng đầy đủ.
 */
@Component
@RequiredArgsConstructor
@Slf4j
class GlossStatsListener {

	static final int MAX_ROWS_PER_SESSION = 300;

	private final Map<String, LongAdder> counts = new ConcurrentHashMap<>();
	/** Số dòng đã ghi theo phiên — tránh đếm lại bằng COUNT(*) mỗi sự kiện. */
	private final Map<String, LongAdder> rowsPerSession = new ConcurrentHashMap<>();

	private final GlossUsageRepository usages;

	@ApplicationModuleListener
	void on(GlossRecognized event) {
		counts.computeIfAbsent(event.gloss(), g -> new LongAdder()).increment();

		LongAdder written = rowsPerSession.computeIfAbsent(event.sessionId(), id -> new LongAdder());
		if (written.sum() >= MAX_ROWS_PER_SESSION) {
			log.debug("Phiên {} đã đạt trần {} dòng — bỏ qua ghi DB", event.sessionId(), MAX_ROWS_PER_SESSION);
			return;
		}
		written.increment();

		usages.save(GlossUsage.builder()
				.sessionId(event.sessionId())
				.gloss(event.gloss())
				.confidence(event.confidence())
				.at(event.at())
				.build());
		log.debug("Thống kê: {} đã được nhận diện {} lần", event.gloss(), counts.get(event.gloss()).sum());
	}
}
