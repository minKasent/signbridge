package vn.signbridge.translation;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;

/**
 * Client gọi ML service (FastAPI): gửi cửa sổ landmark, nhận gloss + confidence.
 * ML service chết → trả Optional.empty(), phiên dịch không sập.
 */
@Component
@Slf4j
class MlClient {

	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
	private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

	private final RestClient restClient;

	MlClient(@Value("${signbridge.ml.base-url}") String baseUrl) {
		// Ép HTTP/1.1: JDK HttpClient mặc định gửi "Upgrade: h2c" + chunked,
		// uvicorn/h11 từ chối ("Invalid HTTP request") — tìm ra qua dump TCP thô.
		HttpClient http11 = HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(CONNECT_TIMEOUT)
				.build();
		// Không có timeout đọc thì một ML service treo sẽ khóa vĩnh viễn thread
		// WebSocket đang gọi nó. Suy luận phải gần thời gian thực nên 3s là quá đủ.
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(http11);
		requestFactory.setReadTimeout(READ_TIMEOUT);
		this.restClient = RestClient.builder()
				.baseUrl(baseUrl)
				.requestFactory(requestFactory)
				.build();
	}

	Optional<InferResponse> infer(List<double[]> frames) {
		try {
			InferResponse response = restClient.post()
					.uri("/infer")
					.body(new InferRequest(frames))
					.retrieve()
					.body(InferResponse.class);
			return Optional.ofNullable(response);
		}
		catch (RestClientException e) {
			log.warn("ML service không phản hồi: {}", e.getMessage());
			return Optional.empty();
		}
	}

	record InferRequest(List<double[]> frames) {
	}

	record InferResponse(String gloss, double confidence) {
	}
}
