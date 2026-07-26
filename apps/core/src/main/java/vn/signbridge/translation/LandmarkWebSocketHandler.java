package vn.signbridge.translation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/**
 * Nhận stream landmark từ browser qua raw WebSocket (KHÔNG dùng STOMP —
 * point-to-point, tần suất cao, không cần broker).
 *
 * Client gửi: {"type":"frames","frames":[[x,y,z,...], ...]}
 *             {"type":"flush"}  — chốt câu thủ công
 * Server trả: {"type":"gloss","gloss":"XIN_CHAO","confidence":0.93}
 *             {"type":"sentence","text":"Xin chào bác sĩ.","glosses":[...],"source":"llm"}
 *
 * Cửa sổ trượt: WINDOW=32 frame, STRIDE=8. Cửa sổ luôn lấy từ ĐẦU buffer và lặp
 * tới khi không đủ frame — nếu chỉ xử lý một cửa sổ mỗi tin nhắn thì buffer phình
 * vô hạn với lô lớn và frame cũ không bao giờ được suy luận.
 *
 * Endpoint công khai (không auth) nên mọi giới hạn đầu vào phải kiểm ở đây:
 * số frame mỗi lô, số chiều mỗi frame, và trần buffer mỗi phiên.
 */
@Component
@RequiredArgsConstructor
@Slf4j
class LandmarkWebSocketHandler extends TextWebSocketHandler {

	private static final int WINDOW = 32;
	private static final int STRIDE = 8;
	private static final int FRAME_DIMS = 144;
	private static final int MAX_BATCH_FRAMES = 60;
	private static final int MAX_BUFFERED_FRAMES = 4 * WINDOW;
	private static final int MAX_WINDOWS_PER_MESSAGE = 4;
	/** Câu được gửi từ virtual thread khác → giới hạn hàng đợi gửi của mỗi phiên. */
	private static final int SEND_BUFFER_BYTES = 512 * 1024;
	private static final int SEND_TIME_LIMIT_MS = 5_000;

	private final TranslationService translationService;
	private final ObjectMapper objectMapper;

	private final Map<String, List<double[]>> buffers = new ConcurrentHashMap<>();
	/** Bọc ConcurrentWebSocketSessionDecorator vì câu được gửi từ thread khác. */
	private final Map<String, WebSocketSession> senders = new ConcurrentHashMap<>();

	@Override
	public void afterConnectionEstablished(WebSocketSession session) {
		buffers.put(session.getId(), new ArrayList<>());
		senders.put(session.getId(), new ConcurrentWebSocketSessionDecorator(
				session, SEND_TIME_LIMIT_MS, SEND_BUFFER_BYTES));
		translationService.openSession(session.getId());
		log.info("Phiên dịch mới: {}", session.getId());
	}

	@Override
	protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
		// Mốc bắt đầu đo độ trễ đầu-cuối phía server: từ lúc lô frame tới nơi cho
		// tới lúc gloss sẵn sàng gửi lại (số liệu p50/p95 của chương đánh giá).
		long receivedAtNanos = System.nanoTime();
		ClientMessage incoming;
		try {
			incoming = objectMapper.readValue(message.getPayload(), ClientMessage.class);
		}
		catch (RuntimeException e) {
			closeInvalid(session, "JSON không hợp lệ");
			return;
		}

		if ("flush".equals(incoming.type())) {
			translationService.flush(session.getId())
					.ifPresent(future -> sendSentenceWhenReady(session.getId(), future));
			return;
		}
		if (!"frames".equals(incoming.type()) || incoming.frames() == null) {
			return;
		}
		if (incoming.frames().size() > MAX_BATCH_FRAMES) {
			closeInvalid(session, "Lô vượt quá " + MAX_BATCH_FRAMES + " frame");
			return;
		}
		if (incoming.frames().stream().anyMatch(f -> f == null || f.length != FRAME_DIMS)) {
			closeInvalid(session, "Mỗi frame phải đúng " + FRAME_DIMS + " chiều");
			return;
		}

		List<double[]> buffer = buffers.get(session.getId());
		if (buffer == null) {
			return;
		}

		buffer.addAll(incoming.frames());
		// Trần buffer: nếu suy luận chậm hơn tốc độ gửi thì bỏ frame cũ nhất
		if (buffer.size() > MAX_BUFFERED_FRAMES) {
			buffer.subList(0, buffer.size() - MAX_BUFFERED_FRAMES).clear();
		}

		int windows = 0;
		while (buffer.size() >= WINDOW && windows < MAX_WINDOWS_PER_MESSAGE) {
			List<double[]> window = List.copyOf(buffer.subList(0, WINDOW));
			buffer.subList(0, STRIDE).clear();
			windows++;

			TranslationService.WindowOutcome outcome =
					translationService.processWindow(session.getId(), window, receivedAtNanos);
			outcome.glossResult().ifPresent(result -> send(session.getId(), Map.of(
					"type", "gloss",
					"gloss", result.gloss(),
					"confidence", result.confidence())));
			outcome.sentenceResult().ifPresent(future -> sendSentenceWhenReady(session.getId(), future));
		}
	}

	private void sendSentenceWhenReady(String sessionId,
			java.util.concurrent.CompletableFuture<SentenceComposer.Sentence> future) {
		future.thenAccept(sentence -> {
			if (sentence.text().isBlank()) {
				return;
			}
			send(sessionId, Map.of(
					"type", "sentence",
					"text", sentence.text(),
					"glosses", sentence.glosses(),
					"source", sentence.source()));
		}).exceptionally(e -> {
			log.warn("Ghép câu thất bại cho phiên {}: {}", sessionId, e.getMessage());
			return null;
		});
	}

	private void send(String sessionId, Map<String, Object> payload) {
		WebSocketSession sender = senders.get(sessionId);
		if (sender == null || !sender.isOpen()) {
			return;
		}
		try {
			sender.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
		}
		catch (Exception e) {
			log.warn("Không gửi được dữ liệu cho phiên {}: {}", sessionId, e.getMessage());
		}
	}

	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
		buffers.remove(session.getId());
		senders.remove(session.getId());
		translationService.closeSession(session.getId());
		log.info("Đóng phiên dịch: {}", session.getId());
	}

	private void closeInvalid(WebSocketSession session, String reason) throws Exception {
		log.warn("Đóng phiên {} do dữ liệu không hợp lệ: {}", session.getId(), reason);
		session.close(CloseStatus.POLICY_VIOLATION.withReason(reason));
	}

	record ClientMessage(String type, List<double[]> frames) {
	}
}
