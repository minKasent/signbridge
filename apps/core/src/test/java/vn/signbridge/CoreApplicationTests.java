package vn.signbridge;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * Cần servlet container thật (RANDOM_PORT) chứ không phải môi trường mock:
 * bean cấu hình buffer WebSocket đọc jakarta.websocket ServerContainer từ
 * ServletContext, môi trường mock không có nên context không nạp được.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CoreApplicationTests {

	@Test
	void contextLoads() {
	}

}
