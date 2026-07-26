package vn.signbridge.translation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * Xử lý một cửa sổ landmark: gọi ML suy luận, lọc theo ngưỡng confidence,
 * phát sự kiện GlossRecognized cho các module khác.
 *
 * Giai đoạn sau: buffer gloss theo session + phát hiện nghỉ tay → gọi LLM ghép câu.
 */
@Service
@RequiredArgsConstructor
class TranslationService {

	/** Ngưỡng tối thiểu để chấp nhận một dự đoán — sẽ tinh chỉnh ở tuần 7. */
	private static final double CONFIDENCE_THRESHOLD = 0.6;

	private final MlClient mlClient;
	private final ApplicationEventPublisher events;

	@Transactional
	Optional<MlClient.InferResponse> processWindow(String sessionId, List<double[]> frames) {
		return mlClient.infer(frames)
				.filter(r -> r.confidence() >= CONFIDENCE_THRESHOLD)
				.map(r -> {
					events.publishEvent(new GlossRecognized(sessionId, r.gloss(), r.confidence(), Instant.now()));
					return r;
				});
	}
}
