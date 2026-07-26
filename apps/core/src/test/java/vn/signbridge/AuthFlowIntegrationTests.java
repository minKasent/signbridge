package vn.signbridge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

/**
 * Test tích hợp trên Postgres thật (Testcontainers): luồng đăng ký/đăng nhập,
 * phân quyền ADMIN vs USER, và các ràng buộc đầu vào của module dataset.
 * Chạy được trong CI mà không cần cấu hình thêm — runner GitHub có sẵn Docker.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class AuthFlowIntegrationTests {

	private static final ParameterizedTypeReference<Map<String, Object>> JSON_MAP =
			new ParameterizedTypeReference<>() {
			};

	@LocalServerPort
	int port;

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

	private ResponseEntity<Map<String, Object>> register(String email) {
		return client.post().uri("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("email", email, "password", "matkhau123", "displayName", "IT Test"))
				.retrieve().toEntity(JSON_MAP);
	}

	private String adminToken() {
		ResponseEntity<Map<String, Object>> login = client.post().uri("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("email", "admin@signbridge.vn", "password", "signbridge-admin-dev"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(login.getBody().get("role")).isEqualTo("ADMIN");
		return (String) login.getBody().get("token");
	}

	@Test
	void dangKyCongKhaiChiDuocQuyenUser() {
		ResponseEntity<Map<String, Object>> registered = register("user1@signbridge.vn");
		assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		assertThat(registered.getBody().get("role")).isEqualTo("USER");

		// Email trùng phải là 409, không phải 500
		assertThat(register("user1@signbridge.vn").getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void chiAdminMoiDuocGhiTuDien() {
		String userToken = (String) register("user2@signbridge.vn").getBody().get("token");
		Map<String, String> sign = Map.of("gloss", "IT_TEST", "meaningVi", "test tích hợp", "category", "DAILY");

		// Không token → 401
		assertThat(client.post().uri("/api/signs").contentType(MediaType.APPLICATION_JSON)
				.body(sign).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);

		// Token USER → 403
		assertThat(client.post().uri("/api/signs").contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + userToken)
				.body(sign).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.FORBIDDEN);

		// Token ADMIN (tài khoản bootstrap) → 201
		assertThat(client.post().uri("/api/signs").contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(sign).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.CREATED);
	}

	@Test
	void datasetChiNhanGlossCoThatVaDungSoChieu() {
		List<double[]> validFrames = java.util.stream.Stream.generate(() -> new double[144]).limit(20).toList();
		List<double[]> badDimFrames = java.util.stream.Stream.generate(() -> new double[100]).limit(20).toList();

		// Gloss XIN_CHAO do SignSeeder tạo sẵn → hợp lệ
		assertThat(postSample("XIN_CHAO", validFrames)).isEqualTo(HttpStatus.CREATED);
		// Sai số chiều → 400
		assertThat(postSample("XIN_CHAO", badDimFrames)).isEqualTo(HttpStatus.BAD_REQUEST);
		// Gloss không có trong từ điển → 400 (chặn tạo thư mục rác / nhiễu nhãn)
		assertThat(postSample("KHONG_CO_THAT", validFrames)).isEqualTo(HttpStatus.BAD_REQUEST);
		// Gloss toàn ký tự lạ → 400 (không được rơi vào thư mục gốc dataset)
		assertThat(postSample("…", validFrames)).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	private HttpStatus postSample(String gloss, List<double[]> frames) {
		return (HttpStatus) client.post().uri("/api/dataset/samples")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("gloss", gloss, "signerName", "IT", "fps", 25.0, "frames", frames))
				.retrieve().toBodilessEntity().getStatusCode();
	}
}
