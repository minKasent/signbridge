package vn.signbridge.translation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/**
 * Nhận stream landmark từ browser qua raw WebSocket (KHÔNG dùng STOMP —
 * point-to-point, tần suất cao, không cần broker).
 *
 * Client gửi: {"type":"frames","frames":[[x,y,z,...], ...]}
 * Server trả: {"type":"gloss","gloss":"XIN_CHAO","confidence":0.93}
 *
 * Cửa sổ trượt: WINDOW=32 frame, STRIDE=8 (khuyến nghị tài liệu: window 16-32,
 * stride 2-4 khi có model thật, kèm lớp "NO_SIGN"). Cửa sổ luôn lấy từ ĐẦU buffer
 * và lặp cho tới khi không đủ frame — nếu chỉ xử lý một cửa sổ mỗi tin nhắn thì
 * buffer phình vô hạn với lô lớn và các frame cũ không bao giờ được suy luận.
 *
 * Endpoint này công khai (không auth) nên mọi giới hạn đầu vào phải kiểm ở đây:
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

	private final TranslationService translationService;
	private final ObjectMapper objectMapper;

	private final Map<String, List<double[]>> buffers = new ConcurrentHashMap<>();

	@Override
	public void afterConnectionEstablished(WebSocketSession session) {
		buffers.put(session.getId(), new ArrayList<>());
		log.info("Phiên dịch mới: {}", session.getId());
	}

	@Override
	protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
		FramesMessage incoming;
		try {
			incoming = objectMapper.readValue(message.getPayload(), FramesMessage.class);
		}
		catch (RuntimeException e) {
			closeInvalid(session, "JSON không hợp lệ");
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

			translationService.processWindow(session.getId(), window).ifPresent(result -> {
				try {
					session.sendMessage(new TextMessage(objectMapper.writeValueAsString(
							Map.of("type", "gloss", "gloss", result.gloss(), "confidence", result.confidence()))));
				}
				catch (Exception e) {
					log.warn("Không gửi được kết quả cho phiên {}: {}", session.getId(), e.getMessage());
				}
			});
		}
	}

	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
		buffers.remove(session.getId());
		log.info("Đóng phiên dịch: {}", session.getId());
	}

	private void closeInvalid(WebSocketSession session, String reason) throws Exception {
		log.warn("Đóng phiên {} do dữ liệu không hợp lệ: {}", session.getId(), reason);
		session.close(CloseStatus.POLICY_VIOLATION.withReason(reason));
	}

	record FramesMessage(String type, List<double[]> frames) {
	}
}
