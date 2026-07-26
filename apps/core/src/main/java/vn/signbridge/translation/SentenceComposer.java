package vn.signbridge.translation;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

// Spring Boot 4 dùng Jackson 3: package là `tools.jackson.*`, KHÔNG phải
// `com.fasterxml.jackson.*` như Jackson 2.
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import vn.signbridge.dictionary.SignCatalog;

/**
 * Ghép chuỗi gloss thành câu tiếng Việt tự nhiên.
 *
 * Ngữ pháp VSL khác tiếng Việt nói (thiếu hư từ, trật tự khác) nên đây là một
 * bước xử lý ngôn ngữ thật sự, không phải "gắn AI cho có". Cách làm theo tiền lệ
 * Spotter+GPT (arXiv 2403.10434): prompt few-shot, KHÔNG fine-tune.
 *
 * Ba lớp phòng thủ để demo không bao giờ chết:
 *   1. cache theo chuỗi gloss (câu lặp lại trả về tức thì, tiết kiệm quota)
 *   2. gọi Gemini Flash (miễn phí) với timeout ngắn
 *   3. hỏng/không có key → ghép nghĩa tiếng Việt lấy từ từ điển
 *
 * Chạy trên virtual thread (Java 21) để không chiếm thread WebSocket.
 */
@Component
@Slf4j
class SentenceComposer {

	private static final int CACHE_SIZE = 200;

	/** Sinh bằng tools/seed_sentence_cache.py từ kết quả bộ đánh giá — xem napCacheMoi(). */
	private static final String SEED_FILE = "sentence-cache-seed.json";

	private static final String SYSTEM_PROMPT = """
			Bạn chuyển chuỗi gloss ngôn ngữ ký hiệu tiếng Việt (VSL) thành MỘT câu tiếng Việt tự nhiên.
			Quy tắc: giữ đúng ý, thêm hư từ cho đúng ngữ pháp, KHÔNG thêm thông tin mới,
			chỉ trả về đúng một câu, không giải thích, không xuống dòng.
			Ví dụ:
			TOI / MUON / KHAM_BENH -> Tôi muốn khám bệnh ạ.
			BAN / TEN / GI -> Bạn tên là gì?
			TOI / DAU / DAU -> Tôi bị đau đầu.
			XIN_CHAO / BAC_SI -> Xin chào bác sĩ.
			TOI / CAN / GIUP_DO -> Tôi cần được giúp đỡ.
			CAM_ON / BAN -> Cảm ơn bạn.
			""";

	private final SignCatalog signCatalog;
	private final RestClient gemini;
	private final String model;
	private final String apiKey;
	private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

	/** LRU đơn giản, đủ cho quy mô đồ án. */
	private final Map<String, String> cache = Collections.synchronizedMap(
			new LinkedHashMap<>(16, 0.75f, true) {
				@Override
				protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
					return size() > CACHE_SIZE;
				}
			});

	SentenceComposer(SignCatalog signCatalog,
			@Value("${signbridge.llm.base-url}") String baseUrl,
			@Value("${signbridge.llm.model}") String model,
			@Value("${signbridge.llm.api-key:}") String apiKey,
			@Value("${signbridge.llm.timeout-seconds:8}") long timeoutSeconds) {
		this.signCatalog = signCatalog;
		this.model = model;
		this.apiKey = apiKey;
		java.net.http.HttpClient http = java.net.http.HttpClient.newBuilder()
				.version(java.net.http.HttpClient.Version.HTTP_1_1)
				.connectTimeout(Duration.ofSeconds(3))
				.build();
		var factory = new org.springframework.http.client.JdkClientHttpRequestFactory(http);
		factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
		this.gemini = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
		if (apiKey.isBlank()) {
			log.warn("Chưa có GEMINI_API_KEY — sẽ ghép câu bằng nghĩa trong từ điển");
		}
		napCacheMoi();
	}

	/**
	 * Nạp sẵn các cặp chuỗi-gloss → câu đã sinh từ trước vào cache.
	 *
	 * Gói LLM miễn phí chỉ cho 20 lượt/NGÀY cho mỗi mô hình, nên nếu để demo tự gọi thì
	 * chạy thử vài lượt trước buổi bảo vệ là cạn hạn mức, và giữa buổi trình diễn khâu
	 * ghép câu sẽ tụt xuống lớp dự phòng. Mồi sẵn cache khử luôn cả rủi ro đó lẫn ~2,9
	 * giây chờ mạng mỗi câu.
	 *
	 * Câu mồi là đầu ra THẬT mà mô hình đã sinh, được ghi lại trong bộ đánh giá
	 * (docs/report/data/sentence-eval.json) rồi kết xuất bằng tools/seed_sentence_cache.py
	 * — không phải câu viết tay. Thiếu tệp thì bỏ qua, hệ thống chạy y như cũ.
	 */
	private void napCacheMoi() {
		var resource = new ClassPathResource(SEED_FILE);
		if (!resource.exists()) {
			log.info("Không có {} — cache ghép câu bắt đầu rỗng", SEED_FILE);
			return;
		}
		try (var in = resource.getInputStream()) {
			Map<String, String> seed = new ObjectMapper().readValue(in, new TypeReference<>() {
			});
			seed.forEach((glossLine, text) -> {
				if (glossLine != null && text != null && !text.isBlank()) {
					cache.put(glossLine, text);
				}
			});
			log.info("Đã mồi {} câu vào cache ghép câu từ {}", seed.size(), SEED_FILE);
		}
		catch (Exception e) {
			// Tệp mồi hỏng KHÔNG được làm chết ứng dụng — nó chỉ là tối ưu, không phải
			// dữ liệu bắt buộc.
			log.warn("Không đọc được {}: {}", SEED_FILE, e.getMessage());
		}
	}

	CompletableFuture<Sentence> composeAsync(List<String> glosses) {
		return CompletableFuture.supplyAsync(() -> compose(glosses), executor);
	}

	Sentence compose(List<String> glosses) {
		String key = String.join("/", glosses);
		String cached = cache.get(key);
		if (cached != null) {
			return new Sentence(cached, glosses, "cache");
		}
		if (!apiKey.isBlank()) {
			try {
				String text = callGemini(key);
				if (text != null && !text.isBlank()) {
					String cleaned = text.strip().lines().findFirst().orElse(text).strip();
					cache.put(key, cleaned);
					return new Sentence(cleaned, glosses, "llm");
				}
			}
			catch (Exception e) {
				log.warn("Gọi LLM thất bại, dùng cách ghép dự phòng: {}", e.getMessage());
			}
		}
		return new Sentence(fallback(glosses), glosses, "fallback");
	}

	private String callGemini(String glossLine) {
		Map<String, Object> body = Map.of(
				"system_instruction", Map.of("parts", List.of(Map.of("text", SYSTEM_PROMPT))),
				"contents", List.of(Map.of("parts", List.of(Map.of("text", glossLine)))),
				"generationConfig", Map.of("temperature", 0.2, "maxOutputTokens", 500));

		GeminiResponse response = gemini.post()
				.uri("/v1beta/models/{model}:generateContent?key={key}", model, apiKey)
				.body(body)
				.retrieve()
				.body(GeminiResponse.class);

		if (response == null || response.candidates() == null || response.candidates().isEmpty()) {
			return null;
		}
		var parts = response.candidates().get(0).content().parts();
		return parts == null || parts.isEmpty() ? null : parts.get(0).text();
	}

	/** Ghép nghĩa tiếng Việt của từng gloss — thô nhưng luôn hiểu được. */
	private String fallback(List<String> glosses) {
		String joined = glosses.stream()
				.map(g -> signCatalog.meaningOf(g).orElse(g.toLowerCase().replace('_', ' ')))
				.collect(Collectors.joining(" "));
		if (joined.isBlank()) {
			return "";
		}
		return Character.toUpperCase(joined.charAt(0)) + joined.substring(1) + ".";
	}

	@PreDestroy
	void shutdown() {
		executor.shutdown();
	}

	/** @param source cache | llm | fallback — hiển thị lên UI và ghi vào số liệu đánh giá */
	record Sentence(String text, List<String> glosses, String source) {
	}

	// --- DTO phản hồi Gemini (chỉ lấy phần cần dùng) ---
	record GeminiResponse(List<Candidate> candidates) {
	}

	record Candidate(Content content) {
	}

	record Content(List<Part> parts) {
	}

	record Part(String text) {
	}
}
