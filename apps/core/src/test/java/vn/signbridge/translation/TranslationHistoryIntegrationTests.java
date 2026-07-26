package vn.signbridge.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;

import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Lịch sử phiên dịch (bảng sessions/transcripts) phải được ghi khi phiên ĐÓNG,
 * chứ không phải trên hot path — và phiên không nhận diện được gì thì không ghi
 * dòng nào (endpoint WebSocket công khai, ghi cả kết nối rỗng là mở đường cho rác).
 *
 * MlClient được thay bằng mock: test không cần ML service thật, chỉ cần kiểm
 * đúng phần trạng thái phiên và phần ghi DB của TranslationService.
 */
// RANDOM_PORT chứ không phải MOCK: WebSocketConfig cần ServerContainer thật của
// servlet container, môi trường mock không có và context sẽ không khởi tạo được.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TranslationHistoryIntegrationTests.LocalTestcontainers.class)
class TranslationHistoryIntegrationTests {

	@TestConfiguration(proxyBeanMethods = false)
	static class LocalTestcontainers {

		@Bean
		@ServiceConnection
		PostgreSQLContainer postgresContainer() {
			return new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));
		}
	}

	/** Cửa sổ 32 frame × 144 chiều — đúng kích thước handler gửi xuống service. */
	private static final List<double[]> WINDOW = Stream.generate(() -> new double[144]).limit(32).toList();

	@MockitoBean
	MlClient mlClient;

	@Autowired
	TranslationService translationService;

	@Autowired
	TranslationSessionRepository sessions;

	@Autowired
	TranscriptRepository transcripts;

	@Test
	void phienCoKyHieuDuocLuuKemTranscript() throws Exception {
		String sessionId = "phien-lich-su";
		translationService.openSession(sessionId);

		// Hai gloss khác nhau (gloss trùng liền kề bị chặn vì cửa sổ trượt chồng lấn)
		given(mlClient.infer(anyList())).willReturn(Optional.of(new MlClient.InferResponse("XIN_CHAO", 0.93)));
		translationService.processWindow(sessionId, WINDOW, System.nanoTime());
		given(mlClient.infer(anyList())).willReturn(Optional.of(new MlClient.InferResponse("CAM_ON", 0.88)));
		translationService.processWindow(sessionId, WINDOW, System.nanoTime());

		// Chốt câu thủ công như client bấm "Chốt câu" / video phát hết
		assertThat(translationService.flush(sessionId)).isPresent();

		translationService.closeSession(sessionId);

		// Ghi DB chạy bất đồng bộ sau khi câu ghép xong → chờ tối đa ~20 giây
		TranslationSessionRecord saved = null;
		long deadline = System.currentTimeMillis() + 20_000;
		while (System.currentTimeMillis() < deadline) {
			saved = sessions.findAll().stream()
					.filter(s -> sessionId.equals(s.getWsSessionId()))
					.findFirst().orElse(null);
			if (saved != null) {
				break;
			}
			Thread.sleep(200);
		}

		assertThat(saved).as("phiên có ký hiệu phải được lưu trong 20s").isNotNull();
		assertThat(saved.getGlossCount()).isEqualTo(2);
		assertThat(saved.getSentenceCount()).isEqualTo(1);
		assertThat(saved.getEndedAt()).isAfterOrEqualTo(saved.getStartedAt());

		Long savedId = saved.getId();
		List<TranscriptRecord> lines = transcripts.findAll().stream()
				.filter(t -> t.getSession().getId().equals(savedId))
				.toList();
		assertThat(lines).hasSize(1);
		assertThat(lines.get(0).getGlosses()).isEqualTo("XIN_CHAO/CAM_ON");
		assertThat(lines.get(0).getText()).isNotBlank();
		// Không có GEMINI_API_KEY trong test → phải rơi về cách ghép dự phòng
		assertThat(lines.get(0).getSource()).isEqualTo("fallback");
	}

	@Test
	void phienKhongNhanDienDuocGiThiKhongGhiDong() throws Exception {
		long before = sessions.count();
		String sessionId = "phien-rong";
		translationService.openSession(sessionId);

		// ML service chết / không thấy ký hiệu nào
		given(mlClient.infer(anyList())).willReturn(Optional.empty());
		translationService.processWindow(sessionId, WINDOW, System.nanoTime());
		translationService.closeSession(sessionId);

		Thread.sleep(1_000); // đủ để tác vụ ghi (nếu có) kịp chạy
		assertThat(sessions.count()).isEqualTo(before);
	}
}
