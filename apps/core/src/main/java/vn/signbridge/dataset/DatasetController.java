package vn.signbridge.dataset;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import vn.signbridge.dictionary.SignCatalog;

/**
 * Nhận mẫu ký hiệu từ trang thu dữ liệu (/collect).
 *
 * Endpoint để mở (không cần đăng nhập) trong giai đoạn thu mẫu với bạn bè, nên
 * mọi ràng buộc phải kiểm ở đây: gloss phải là ký hiệu CÓ THẬT trong từ điển
 * (không thì ai cũng tạo được thư mục rác và làm nhiễu nhãn huấn luyện), số frame
 * và số chiều phải đúng chuẩn 144 của frontend.
 */
@RestController
@RequestMapping("/api/dataset")
@RequiredArgsConstructor
@Slf4j
class DatasetController {

	/** Khớp vector đặc trưng của frontend: 2 tay × 21 × 3 + 6 điểm thân trên × 3. */
	private static final int EXPECTED_DIMS = 144;
	private static final int MIN_FRAMES = 10;
	private static final int MAX_FRAMES = 300;
	/** Gloss chỉ gồm A-Z, 0-9, gạch dưới — dùng trực tiếp làm tên thư mục. */
	private static final Pattern SAFE_GLOSS = Pattern.compile("[A-Z0-9_]{1,64}");

	private final SampleRepository samples;
	private final SampleStorage storage;
	private final SignCatalog signCatalog;

	@PostMapping("/samples")
	@ResponseStatus(HttpStatus.CREATED)
	SampleRecord upload(@Valid @RequestBody UploadRequest request) throws IOException {
		String gloss = request.gloss();
		if (!SAFE_GLOSS.matcher(gloss).matches() || !signCatalog.existsByGloss(gloss)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Gloss không tồn tại trong từ điển: " + gloss);
		}
		if (request.frames().size() < MIN_FRAMES || request.frames().size() > MAX_FRAMES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Số frame phải trong khoảng %d-%d".formatted(MIN_FRAMES, MAX_FRAMES));
		}
		if (request.frames().stream().anyMatch(f -> f == null || f.length != EXPECTED_DIMS)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Mỗi frame phải đúng %d chiều".formatted(EXPECTED_DIMS));
		}

		String filePath = storage.store(gloss, request.signerName(), request.fps(), request.frames());
		try {
			return samples.save(SampleRecord.builder()
					.gloss(gloss)
					.signerName(request.signerName())
					.frameCount(request.frames().size())
					.dims(EXPECTED_DIMS)
					.fps(request.fps())
					.filePath(filePath)
					.build());
		}
		catch (RuntimeException e) {
			// Lưu DB hỏng → xóa file vừa ghi, tránh file mồ côi không ai biết tới
			try {
				storage.delete(filePath);
			}
			catch (IOException cleanupError) {
				log.warn("Không xóa được file mồ côi {}: {}", filePath, cleanupError.getMessage());
			}
			throw e;
		}
	}

	/** Tiến độ thu mẫu theo gloss — trang /collect hiển thị. */
	@GetMapping("/stats")
	Map<String, Long> stats() {
		return samples.countByGloss().stream()
				.collect(Collectors.toMap(
						SampleRepository.GlossCount::getGloss,
						SampleRepository.GlossCount::getTotal,
						(a, b) -> a,
						TreeMap::new));
	}

	record UploadRequest(
			@NotBlank String gloss,
			@NotBlank String signerName,
			@Positive double fps,
			@NotEmpty List<double[]> frames) {
	}
}
