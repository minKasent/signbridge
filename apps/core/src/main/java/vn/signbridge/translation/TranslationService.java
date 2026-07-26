package vn.signbridge.translation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

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
 *
 * Lưu lịch sử (bảng sessions/transcripts) chỉ chạy KHI PHIÊN ĐÓNG và trên thread
 * riêng — hot path của phiên dịch không được chạm tới DB.
 */
@Service
@RequiredArgsConstructor
@Slf4j
class TranslationService {

	/** Ngưỡng chấp nhận một dự đoán — tinh chỉnh lại ở tuần 7 khi có model thật. */
	private static final double CONFIDENCE_THRESHOLD = 0.6;
	/** Nhãn "không có ký hiệu" mà model học kèm (lớp nền). */
	private static final String NO_SIGN = "NO_SIGN";
	/** Số cửa sổ liên tiếp không có ký hiệu thì chốt câu. */
	private static final int IDLE_WINDOWS_TO_FINALIZE = 3;
	/** Trần số gloss một câu — tránh đệm phình khi người ký không nghỉ. */
	private static final int MAX_GLOSSES_PER_SENTENCE = 20;
	/** Trần số câu chờ ghi của một phiên — phiên chạy cả buổi không được phình bộ nhớ. */
	private static final int MAX_PENDING_SENTENCES = 50;
	/** Chờ tối đa ngần này giây cho câu đang ghép dở lúc phiên đóng rồi mới ghi DB. */
	private static final long PERSIST_WAIT_SECONDS = 12;

	private final MlClient mlClient;
	private final SentenceComposer sentenceComposer;
	private final ApplicationEventPublisher events;
	private final TransactionTemplate transactionTemplate;
	private final TranslationSessionRepository sessionRepository;
	private final TranscriptRepository transcriptRepository;

	private final Map<String, SessionState> sessions = new ConcurrentHashMap<>();
	/** Ghi DB lúc đóng phiên chạy ở đây để không giữ thread đóng WebSocket. */
	private final ExecutorService persistExecutor = Executors.newVirtualThreadPerTaskExecutor();

	void openSession(String sessionId) {
		sessions.put(sessionId, new SessionState());
	}

	void closeSession(String sessionId) {
		SessionState state = sessions.remove(sessionId);
		if (state == null) {
			return;
		}
		persistWhenReady(sessionId, state.snapshot());
	}

	/**
	 * @param receivedAtNanos mốc System.nanoTime() lúc server nhận lô frame chứa cửa
	 *                        sổ này — dùng để đo độ trễ đầu-cuối phía server.
	 */
	WindowOutcome processWindow(String sessionId, List<double[]> frames, long receivedAtNanos) {
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
					return WindowOutcome.sentence(compose(state));
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
			state.glossCount++;

			// Đo tới lúc gloss SẴN SÀNG gửi: phần còn lại chỉ là serialize + ghi socket
			long latencyMs = Math.round((System.nanoTime() - receivedAtNanos) / 1_000_000.0);
			GlossRecognized event = new GlossRecognized(
					sessionId, result.gloss(), result.confidence(), latencyMs, Instant.now());
			transactionTemplate.executeWithoutResult(tx -> events.publishEvent(event));

			if (state.glosses.size() >= MAX_GLOSSES_PER_SENTENCE) {
				return new WindowOutcome(result, compose(state));
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
			return Optional.of(compose(state));
		}
	}

	/** Ghép câu và ghi nhớ future để lưu transcript khi phiên đóng. Gọi trong synchronized(state). */
	private CompletableFuture<SentenceComposer.Sentence> compose(SessionState state) {
		CompletableFuture<SentenceComposer.Sentence> future = sentenceComposer.composeAsync(state.drain());
		state.track(future.thenApply(sentence -> new CompletedSentence(sentence, Instant.now())));
		return future;
	}

	/**
	 * Chờ các câu đang ghép dở (LLM mất vài giây) rồi ghi lịch sử phiên.
	 * Phiên không nhận diện được ký hiệu nào thì KHÔNG ghi gì: /ws/translate là
	 * endpoint công khai, mỗi kết nối rỗng mà cũng đẻ một dòng thì bảng chỉ toàn rác.
	 */
	private void persistWhenReady(String sessionId, SessionSnapshot snapshot) {
		if (snapshot.glossCount() == 0 && snapshot.pending().isEmpty()) {
			return;
		}
		CompletableFuture<?>[] pending = snapshot.pending().toArray(CompletableFuture[]::new);
		CompletableFuture.allOf(pending)
				// Câu nào chưa kịp xong sau ngần này giây thì bỏ, không giữ phiên mãi
				.completeOnTimeout(null, PERSIST_WAIT_SECONDS, TimeUnit.SECONDS)
				.whenCompleteAsync((ignored, error) -> persist(sessionId, snapshot), persistExecutor);
	}

	private void persist(String sessionId, SessionSnapshot snapshot) {
		List<CompletedSentence> sentences = snapshot.pending().stream()
				.filter(future -> future.isDone() && !future.isCompletedExceptionally())
				.map(future -> future.getNow(null))
				.filter(Objects::nonNull)
				.filter(completed -> !completed.sentence().text().isBlank())
				.toList();
		try {
			transactionTemplate.executeWithoutResult(tx -> {
				TranslationSessionRecord session = sessionRepository.save(TranslationSessionRecord.builder()
						.wsSessionId(sessionId)
						.startedAt(snapshot.startedAt())
						.endedAt(Instant.now())
						.glossCount(snapshot.glossCount())
						.sentenceCount(sentences.size())
						.build());
				sentences.forEach(completed -> transcriptRepository.save(TranscriptRecord.builder()
						.session(session)
						.text(completed.sentence().text())
						.glosses(String.join("/", completed.sentence().glosses()))
						.source(completed.sentence().source())
						.at(completed.at())
						.build()));
			});
		}
		catch (RuntimeException e) {
			// Mất lịch sử một phiên không được làm hỏng gì khác — chỉ ghi log
			log.warn("Không lưu được lịch sử phiên {}: {}", sessionId, e.getMessage());
		}
	}

	@PreDestroy
	void shutdown() {
		persistExecutor.shutdown();
	}

	private static final class SessionState {

		private final Instant startedAt = Instant.now();
		private final List<String> glosses = new ArrayList<>();
		private final List<CompletableFuture<CompletedSentence>> pending = new ArrayList<>();
		private String lastGloss;
		private int idleWindows;
		private int glossCount;

		private List<String> drain() {
			List<String> drained = List.copyOf(glosses);
			glosses.clear();
			lastGloss = null;
			idleWindows = 0;
			return drained;
		}

		private void track(CompletableFuture<CompletedSentence> future) {
			if (pending.size() >= MAX_PENDING_SENTENCES) {
				pending.remove(0); // giữ các câu gần nhất
			}
			pending.add(future);
		}

		private synchronized SessionSnapshot snapshot() {
			return new SessionSnapshot(startedAt, glossCount, List.copyOf(pending));
		}
	}

	/** Ảnh chụp phiên lúc đóng — tách khỏi SessionState để ghi DB ngoài lock. */
	private record SessionSnapshot(Instant startedAt, int glossCount,
			List<CompletableFuture<CompletedSentence>> pending) {
	}

	/** Câu đã ghép xong kèm thời điểm ghép — transcript cần mốc thật, không phải lúc ghi DB. */
	private record CompletedSentence(SentenceComposer.Sentence sentence, Instant at) {
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
