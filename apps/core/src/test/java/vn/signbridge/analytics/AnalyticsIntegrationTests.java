package vn.signbridge.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import vn.signbridge.translation.GlossRecognized;

/**
 * Test tích hợp module analytics trên Postgres thật: bắn sự kiện GlossRecognized
 * TRONG transaction (@ApplicationModuleListener chỉ chạy SAU commit), chờ listener
 * async ghi DB rồi đối chiếu số liệu gộp qua API summary.
 *
 * Không dùng chung TestcontainersConfiguration (package-private ở vn.signbridge):
 * test module đặt trong package module theo quy ước nên tự khai báo container.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(AnalyticsIntegrationTests.LocalTestcontainers.class)
class AnalyticsIntegrationTests {

	@TestConfiguration(proxyBeanMethods = false)
	static class LocalTestcontainers {

		@Bean
		@ServiceConnection
		PostgreSQLContainer postgresContainer() {
			return new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));
		}
	}

	private static final ParameterizedTypeReference<Map<String, Object>> JSON_MAP =
			new ParameterizedTypeReference<>() {
			};

	/** Phải trùng múi giờ gộp ngày của AnalyticsController. */
	private static final ZoneId ZONE_VN = ZoneId.of("Asia/Ho_Chi_Minh");

	@LocalServerPort
	int port;

	@Autowired
	ApplicationEventPublisher events;

	@Autowired
	TransactionTemplate transactions;

	RestClient client;

	@BeforeEach
	void setUp() {
		client = RestClient.builder()
				.baseUrl("http://localhost:" + port)
				// Không ném exception theo status — test tự assert
				.defaultStatusHandler(status -> true, (request, response) -> {
				})
				.build();
	}

	@Test
	void suKienGlossDuocLuuDbVaTraQuaSummary() throws Exception {
		String token = registerToken("analytics-it@signbridge.vn");

		// days ngoài khoảng cho phép → 400
		assertThat(getSummary(token, 0).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

		// Cùng một mốc thời gian cho cả 3 sự kiện để đối chiếu byDay không dính
		// biên nửa đêm (test chạy lúc 23:59:59 vẫn phải xanh)
		Instant at = Instant.now();
		transactions.executeWithoutResult(tx -> {
			events.publishEvent(new GlossRecognized("phien-it", "XIN_CHAO", 0.91, at));
			events.publishEvent(new GlossRecognized("phien-it", "XIN_CHAO", 0.88, at));
			events.publishEvent(new GlossRecognized("phien-it", "CAM_ON", 0.95, at));
		});

		// Listener chạy async sau commit → poll tối đa ~10 giây
		Map<String, Object> summary = null;
		long deadline = System.currentTimeMillis() + 10_000;
		while (System.currentTimeMillis() < deadline) {
			ResponseEntity<Map<String, Object>> res = getSummary(token, 7);
			if (res.getStatusCode() == HttpStatus.OK
					&& ((Number) res.getBody().get("totalGlosses")).longValue() >= 3) {
				summary = res.getBody();
				break;
			}
			Thread.sleep(200);
		}

		assertThat(summary).as("listener phải ghi đủ 3 bản ghi trong 10s").isNotNull();
		assertThat(((Number) summary.get("totalGlosses")).longValue()).isEqualTo(3);

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> byGloss = (List<Map<String, Object>>) summary.get("byGloss");
		// Sắp theo count giảm dần → XIN_CHAO (2) trước CAM_ON (1)
		assertThat(byGloss).extracting(g -> g.get("gloss")).containsExactly("XIN_CHAO", "CAM_ON");
		assertThat(((Number) byGloss.get(0).get("count")).longValue()).isEqualTo(2);
		assertThat(((Number) byGloss.get(1).get("count")).longValue()).isEqualTo(1);

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> byDay = (List<Map<String, Object>>) summary.get("byDay");
		String expectedDay = LocalDate.ofInstant(at, ZONE_VN).toString();
		assertThat(byDay).extracting(d -> d.get("date")).containsExactly(expectedDay);
		assertThat(((Number) byDay.get(0).get("count")).longValue()).isEqualTo(3);
	}

	private ResponseEntity<Map<String, Object>> getSummary(String token, int days) {
		return client.get().uri("/api/analytics/summary?days=" + days)
				.header("Authorization", "Bearer " + token)
				.retrieve().toEntity(JSON_MAP);
	}

	private String registerToken(String email) {
		ResponseEntity<Map<String, Object>> registered = client.post().uri("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("email", email, "password", "matkhau123", "displayName", "Analytics IT"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		return (String) registered.getBody().get("token");
	}
}
