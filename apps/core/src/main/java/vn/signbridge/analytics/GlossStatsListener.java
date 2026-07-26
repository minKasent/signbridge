package vn.signbridge.analytics;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;
import vn.signbridge.translation.GlossRecognized;

/**
 * Đếm số lần mỗi ký hiệu được nhận diện — ví dụ giao tiếp giữa module
 * qua sự kiện (async, ngoài hot path). Tuần 11 sẽ lưu DB + dashboard.
 */
@Component
@Slf4j
class GlossStatsListener {

	private final Map<String, LongAdder> counts = new ConcurrentHashMap<>();

	@ApplicationModuleListener
	void on(GlossRecognized event) {
		counts.computeIfAbsent(event.gloss(), g -> new LongAdder()).increment();
		log.debug("Thống kê: {} đã được nhận diện {} lần", event.gloss(), counts.get(event.gloss()).sum());
	}
}
