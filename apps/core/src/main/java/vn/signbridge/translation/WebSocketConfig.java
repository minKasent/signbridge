package vn.signbridge.translation;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

import lombok.RequiredArgsConstructor;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
class WebSocketConfig implements WebSocketConfigurer {

	private final LandmarkWebSocketHandler landmarkHandler;

	@Override
	public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
		registry.addHandler(landmarkHandler, "/ws/translate")
				.setAllowedOrigins("http://localhost:3000");
	}

	/**
	 * Buffer mặc định 8KB làm rớt kết nối (mã 1009) khi batch landmark lớn —
	 * phát hiện qua test E2E. 256KB dư sức cho ~90 frame/batch.
	 */
	@Bean
	ServletServerContainerFactoryBean webSocketContainer() {
		ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
		container.setMaxTextMessageBufferSize(256 * 1024);
		container.setMaxBinaryMessageBufferSize(256 * 1024);
		return container;
	}
}
