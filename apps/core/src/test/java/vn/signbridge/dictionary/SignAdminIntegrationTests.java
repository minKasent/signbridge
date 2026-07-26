package vn.signbridge.dictionary;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Test tích hợp API quản trị từ điển (PUT/DELETE /api/signs/{id}) trên Postgres
 * thật: phân quyền USER vs ADMIN, gloss bất biến khi sửa, xóa kéo theo file clip.
 *
 * Khai báo container Postgres ngay trong test vì TestcontainersConfiguration ở
 * package gốc là package-private — module dictionary không nhìn thấy được.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SignAdminIntegrationTests {

	private static final ParameterizedTypeReference<Map<String, Object>> JSON_MAP =
			new ParameterizedTypeReference<>() {
			};

	private static final ParameterizedTypeReference<List<Map<String, Object>>> JSON_LIST =
			new ParameterizedTypeReference<>() {
			};

	@TestConfiguration(proxyBeanMethods = false)
	static class PostgresTestConfig {

		@Bean
		@ServiceConnection
		PostgreSQLContainer postgresContainer() {
			return new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));
		}
	}

	static Path tempClipsDir;

	// Trỏ clips-dir vào thư mục tạm để test khẳng định được file clip bị xóa
	// mà không đụng vào storage/clips của repo.
	@DynamicPropertySource
	static void overrideClipsDir(DynamicPropertyRegistry registry) throws IOException {
		tempClipsDir = Files.createTempDirectory("signbridge-test-clips");
		registry.add("signbridge.storage.clips-dir", () -> tempClipsDir.toString());
	}

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

	private String adminToken() {
		ResponseEntity<Map<String, Object>> login = client.post().uri("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("email", "admin@signbridge.vn", "password", "signbridge-admin-dev"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
		return (String) login.getBody().get("token");
	}

	private String userToken(String email) {
		ResponseEntity<Map<String, Object>> registered = client.post().uri("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("email", email, "password", "matkhau123", "displayName", "IT Test"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		return (String) registered.getBody().get("token");
	}

	/**
	 * Upload clip giả lập qua multipart. Không dùng MultipartBodyBuilder: class đó
	 * tham chiếu org.reactivestreams.Publisher (WebFlux) không có trong classpath
	 * MVC thuần → NoClassDefFoundError khi nạp class.
	 */
	private ResponseEntity<Map<String, Object>> uploadClip(long id, String token, String contentType,
			String filename) {
		HttpHeaders partHeaders = new HttpHeaders();
		partHeaders.setContentType(MediaType.parseMediaType(contentType));
		ByteArrayResource fakeClip = new ByteArrayResource("clip-gia-lap".getBytes()) {
			@Override
			public String getFilename() {
				return filename;
			}
		};
		MultiValueMap<String, Object> multipart = new LinkedMultiValueMap<>();
		multipart.add("file", new HttpEntity<>(fakeClip, partHeaders));

		ResponseEntity<Map<String, Object>> response = client.post().uri("/api/signs/" + id + "/clip")
				.contentType(MediaType.MULTIPART_FORM_DATA)
				.header("Authorization", "Bearer " + token)
				.body(multipart)
				.retrieve().toEntity(JSON_MAP);
		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		return response;
	}

	private long createSign(String gloss) {
		ResponseEntity<Map<String, Object>> created = client.post().uri("/api/signs")
				.contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(Map.of("gloss", gloss, "meaningVi", "nghĩa gốc", "category", "DAILY"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		return ((Number) created.getBody().get("id")).longValue();
	}

	@Test
	void userThuongBi403KhiSuaHoacXoa() {
		long id = createSign("IT_ADMIN_QUYEN");
		String userToken = userToken("user-quyen@signbridge.vn");
		Map<String, String> update = Map.of("meaningVi", "nghĩa mới", "category", "MEDICAL");

		// Không token → 401
		assertThat(client.put().uri("/api/signs/" + id).contentType(MediaType.APPLICATION_JSON)
				.body(update).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(client.delete().uri("/api/signs/" + id)
				.retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.UNAUTHORIZED);

		// Token USER → 403
		assertThat(client.put().uri("/api/signs/" + id).contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + userToken)
				.body(update).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.FORBIDDEN);
		assertThat(client.delete().uri("/api/signs/" + id)
				.header("Authorization", "Bearer " + userToken)
				.retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.FORBIDDEN);
	}

	@Test
	void adminSuaDuocNhungGlossBatBien() {
		long id = createSign("IT_ADMIN_SUA");

		// Body cố tình kèm "gloss" lạ — server phải lờ đi, không đổi gloss
		ResponseEntity<Map<String, Object>> updated = client.put().uri("/api/signs/" + id)
				.contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(Map.of("meaningVi", "nghĩa đã sửa", "category", "MEDICAL", "gloss", "GLOSS_MOI"))
				.retrieve().toEntity(JSON_MAP);

		assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(updated.getBody().get("meaningVi")).isEqualTo("nghĩa đã sửa");
		assertThat(updated.getBody().get("category")).isEqualTo("MEDICAL");
		assertThat(updated.getBody().get("gloss")).isEqualTo("IT_ADMIN_SUA");

		// Thiếu meaningVi → 400 (validation), id không tồn tại → 404
		assertThat(client.put().uri("/api/signs/" + id).contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(Map.of("category", "DAILY")).retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(client.put().uri("/api/signs/999999").contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(Map.of("meaningVi", "x", "category", "DAILY"))
				.retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void taoTrungGlossTra409ChuKhong500() {
		createSign("IT_ADMIN_TRUNG");
		ResponseEntity<Map<String, Object>> duplicated = client.post().uri("/api/signs")
				.contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + adminToken())
				.body(Map.of("gloss", "IT_ADMIN_TRUNG", "meaningVi", "trùng", "category", "DAILY"))
				.retrieve().toEntity(JSON_MAP);
		assertThat(duplicated.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void quayClipThayTheKhacDuoiThiFileCuBiDon() {
		long id = createSign("IT_ADMIN_THAY_DUOI");
		String token = adminToken();

		// Clip đầu là mp4 (mô phỏng import QIPEDC), quay thay bằng webm
		uploadClip(id, token, "video/mp4", "clip.mp4");
		assertThat(tempClipsDir.resolve("sign-" + id + ".mp4")).exists();

		ResponseEntity<Map<String, Object>> replaced = uploadClip(id, token, "video/webm", "clip.webm");
		assertThat(replaced.getBody().get("clipUrl")).isEqualTo("/clips/sign-" + id + ".webm");
		assertThat(tempClipsDir.resolve("sign-" + id + ".webm")).exists();
		// File đuôi cũ phải biến mất — không thì clip bị thay vẫn công khai tại /clips
		assertThat(tempClipsDir.resolve("sign-" + id + ".mp4")).doesNotExist();
	}

	@Test
	void adminXoaDuocKeCaKyHieuCoClip_vaFileClipBiXoaTheo() {
		long id = createSign("IT_ADMIN_XOA");
		String token = adminToken();

		// Gắn clip webm cho ký hiệu trước khi xóa
		ResponseEntity<Map<String, Object>> withClip = uploadClip(id, token, "video/webm", "clip.webm");
		assertThat(withClip.getBody().get("clipUrl")).isEqualTo("/clips/sign-" + id + ".webm");
		assertThat(tempClipsDir.resolve("sign-" + id + ".webm")).exists();

		// Xóa → 204, hết khỏi danh sách, file clip biến mất
		assertThat(client.delete().uri("/api/signs/" + id)
				.header("Authorization", "Bearer " + token)
				.retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.NO_CONTENT);

		ResponseEntity<List<Map<String, Object>>> list = client.get().uri("/api/signs")
				.retrieve().toEntity(JSON_LIST);
		assertThat(list.getBody())
				.noneMatch(sign -> ((Number) sign.get("id")).longValue() == id);
		assertThat(tempClipsDir.resolve("sign-" + id + ".webm")).doesNotExist();

		// Xóa lần nữa → 404
		assertThat(client.delete().uri("/api/signs/" + id)
				.header("Authorization", "Bearer " + token)
				.retrieve().toBodilessEntity().getStatusCode())
				.isEqualTo(HttpStatus.NOT_FOUND);
	}
}
