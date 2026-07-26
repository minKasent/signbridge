package vn.signbridge.translation;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
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

	private final RestClient restClient;

	MlClient(@Value("${signbridge.ml.base-url}") String baseUrl) {
		this.restClient = RestClient.builder().baseUrl(baseUrl).build();
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
