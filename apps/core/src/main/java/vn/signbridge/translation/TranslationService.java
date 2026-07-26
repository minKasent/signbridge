package vn.signbridge.translation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.RequiredArgsConstructor;

/**
 * Bộ não của luồng phiên dịch, giữ trạng thái theo từng phiên:
 *
 *   cửa sổ landmark → ML suy luận gloss → lọc ngưỡng + chặn lặp liền kề
 *   → tích vào bộ đệm gloss → phát hiện "nghỉ tay" → ghép thành câu tiếng Việt
 *
 * Phát hiện nghỉ tay: model trả NO_SIGN (hoặc confidence thấp) liên tiếp đủ số
 * cửa sổ thì coi như người ký đã kết thúc câu.
 *
 * KHÔNG đặt @Transactional lên cả phương thức: giao dịch sẽ giữ một connection
 * Hikari suốt lời gọi HTTP tới ML service. Chỉ bọc giao dịch quanh phần publish
 * (registry sự kiện của Modulith cần giao dịch để listener chạy sau commit).
 */
@Service
@RequiredArgsConstructor
class TranslationService {

	/** Ngưỡng chấp nhận một dự đoán — tinh chỉnh lại ở tuần 7 khi có model thật. */
	private static final double CONFIDENCE_THRESHOLD = 0.6;
	/** Nhãn "không có ký hiệu" mà model học kèm (lớp nền). */
	private static final String NO_SIGN = "NO_SIGN";
	/** Số cửa sổ liên tiếp không có ký hiệu thì chốt câu. */
	private static final int IDLE_WINDOWS_TO_FINALIZE = 3;
	/** Trần số gloss một câu — tránh đệm phình khi người ký không nghỉ. */
	private static final int MAX_GLOSSES_PER_SENTENCE = 20;

	private final MlClient mlClient;
	private final SentenceComposer sentenceComposer;
	private final ApplicationEventPublisher events;
	private final TransactionTemplate transactionTemplate;

	private final Map<String, SessionState> sessions = new ConcurrentHashMap<>();

	void openSession(String sessionId) {
		sessions.put(sessionId, new SessionState());
	}

	void closeSession(String sessionId) {
		sessions.remove(sessionId);
	}

	WindowOutcome processWindow(String sessionId, List<double[]> frames) {
		SessionState state = sessions.get(sessionId);
		if (state == null) {
			return WindowOutcome.EMPTY;
		}
		Optional<MlClient.InferResponse> inferred = mlClient.infer(frames);
		if (inferred.isEmpty()) {
			return WindowOutcome.EMPTY; // ML service lỗi — bỏ qua cửa sổ này
		}
		MlClient.InferResponse result = inferred.get();
		boolean recognized = result.confidence() >= CONFIDENCE_THRESHOLD && !NO_SIGN.equals(result.gloss());

		synchronized (state) {
			if (!recognized) {
				state.idleWindows++;
				if (state.idleWindows >= IDLE_WINDOWS_TO_FINALIZE && !state.glosses.isEmpty()) {
					return WindowOutcome.sentence(sentenceComposer.composeAsync(state.drain()));
				}
				return WindowOutcome.EMPTY;
			}

			state.idleWindows = 0;
			// Cửa sổ trượt chồng lấn nên cùng một ký hiệu xuất hiện nhiều lần liên tiếp
			if (result.gloss().equals(state.lastGloss)) {
				return WindowOutcome.EMPTY;
			}
			state.lastGloss = result.gloss();
			state.glosses.add(result.gloss());

			GlossRecognized event = new GlossRecognized(sessionId, result.gloss(), result.confidence(), Instant.now());
			transactionTemplate.executeWithoutResult(tx -> events.publishEvent(event));

			if (state.glosses.size() >= MAX_GLOSSES_PER_SENTENCE) {
				return new WindowOutcome(result, sentenceComposer.composeAsync(state.drain()));
			}
			return new WindowOutcome(result, null);
		}
	}

	/** Người dùng bấm "chốt câu" thủ công (hoặc ngắt kết nối) — ghép ngay phần đang đệm. */
	Optional<CompletableFuture<SentenceComposer.Sentence>> flush(String sessionId) {
		SessionState state = sessions.get(sessionId);
		if (state == null) {
			return Optional.empty();
		}
		synchronized (state) {
			if (state.glosses.isEmpty()) {
				return Optional.empty();
			}
			return Optional.of(sentenceComposer.composeAsync(state.drain()));
		}
	}

	private static final class SessionState {

		private final List<String> glosses = new ArrayList<>();
		private String lastGloss;
		private int idleWindows;

		private List<String> drain() {
			List<String> drained = List.copyOf(glosses);
			glosses.clear();
			lastGloss = null;
			idleWindows = 0;
			return drained;
		}
	}

	/**
	 * Kết quả xử lý một cửa sổ: có thể có gloss vừa nhận diện, có thể có câu đang
	 * được ghép (bất đồng bộ), hoặc không có gì.
	 */
	record WindowOutcome(MlClient.InferResponse gloss,
			CompletableFuture<SentenceComposer.Sentence> sentence) {

		static final WindowOutcome EMPTY = new WindowOutcome(null, null);

		static WindowOutcome sentence(CompletableFuture<SentenceComposer.Sentence> future) {
			return new WindowOutcome(null, future);
		}

		Optional<MlClient.InferResponse> glossResult() {
			return Optional.ofNullable(gloss);
		}

		Optional<CompletableFuture<SentenceComposer.Sentence>> sentenceResult() {
			return Optional.ofNullable(sentence);
		}
	}
}
