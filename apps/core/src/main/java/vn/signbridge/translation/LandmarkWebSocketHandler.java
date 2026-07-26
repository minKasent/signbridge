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
 * Cửa sổ trượt tạm: WINDOW=32 frame, STRIDE=8 — sẽ tinh chỉnh theo model thật
 * (khuyến nghị từ tài liệu: window 16-32, stride 2-4, thêm lớp "no-sign").
 */
@Component
@RequiredArgsConstructor
@Slf4j
class LandmarkWebSocketHandler extends TextWebSocketHandler {

	private static final int WINDOW = 32;
	private static final int STRIDE = 8;

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
		FramesMessage incoming = objectMapper.readValue(message.getPayload(), FramesMessage.class);
		if (!"frames".equals(incoming.type()) || incoming.frames() == null) {
			return;
		}

		List<double[]> buffer = buffers.get(session.getId());
		buffer.addAll(incoming.frames());

		if (buffer.size() < WINDOW) {
			return;
		}

		List<double[]> window = List.copyOf(buffer.subList(buffer.size() - WINDOW, buffer.size()));
		buffer.subList(0, STRIDE).clear();

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

	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
		buffers.remove(session.getId());
		log.info("Đóng phiên dịch: {}", session.getId());
	}

	record FramesMessage(String type, List<double[]> frames) {
	}
}
