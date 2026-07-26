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
 */
@Component
@RequiredArgsConstructor
@Slf4j
class GlossStatsListener {

	private final Map<String, LongAdder> counts = new ConcurrentHashMap<>();

	private final GlossUsageRepository usages;

	@ApplicationModuleListener
	void on(GlossRecognized event) {
		counts.computeIfAbsent(event.gloss(), g -> new LongAdder()).increment();
		usages.save(GlossUsage.builder()
				.sessionId(event.sessionId())
				.gloss(event.gloss())
				.confidence(event.confidence())
				.at(event.at())
				.build());
		log.debug("Thống kê: {} đã được nhận diện {} lần", event.gloss(), counts.get(event.gloss()).sum());
	}
}
