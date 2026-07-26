package vn.signbridge.dictionary;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/signs")
@RequiredArgsConstructor
class SignController {

	private final SignRepository signs;
	private final ClipStorage clipStorage;
	private final SignComposer composer;

	@GetMapping
	List<Sign> list(@RequestParam(required = false) String category) {
		return category == null ? signs.findAll() : signs.findByCategoryOrderByGloss(category);
	}

	/** Chiều ngược: câu tiếng Việt → chuỗi ký hiệu (+ từ không dịch được). */
	@GetMapping("/compose")
	SignComposer.ComposeResult compose(@RequestParam String text) {
		return composer.compose(text);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Sign create(@Valid @RequestBody CreateSignRequest request) {
		return signs.save(Sign.builder()
				.gloss(request.gloss())
				.meaningVi(request.meaningVi())
				.category(request.category())
				.build());
	}

	/**
	 * Sửa nghĩa/chủ đề của một ký hiệu (ADMIN). Gloss BẤT BIẾN: dataset đã thu
	 * tham chiếu mẫu theo gloss, đổi gloss là mồ côi toàn bộ mẫu đã gán nhãn.
	 */
	@PutMapping("/{id}")
	Sign update(@PathVariable Long id, @Valid @RequestBody UpdateSignRequest request) {
		Sign sign = signs.findById(id).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy ký hiệu"));
		sign.setMeaningVi(request.meaningVi());
		sign.setCategory(request.category());
		return signs.save(sign);
	}

	/** Xóa ký hiệu (ADMIN) — xóa luôn file clip để không để rác trong storage. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable Long id) throws IOException {
		Sign sign = signs.findById(id).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy ký hiệu"));
		clipStorage.delete(sign.getId());
		signs.delete(sign);
	}

	/** Upload clip mẫu cho một ký hiệu (ADMIN — dùng khi xây từ điển tuần 10). */
	@PostMapping("/{id}/clip")
	Sign uploadClip(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
		Sign sign = signs.findById(id).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy ký hiệu"));
		try {
			sign.setClipUrl(clipStorage.store(sign.getId(), file));
		}
		catch (IllegalArgumentException e) {
			throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
		}
		return signs.save(sign);
	}

	record CreateSignRequest(@NotBlank String gloss, @NotBlank String meaningVi, @NotBlank String category) {
	}

	record UpdateSignRequest(@NotBlank String meaningVi, @NotBlank String category) {
	}
}
