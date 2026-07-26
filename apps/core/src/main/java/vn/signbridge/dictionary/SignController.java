package vn.signbridge.dictionary;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/signs")
@RequiredArgsConstructor
class SignController {

	private final SignRepository signs;

	@GetMapping
	List<Sign> list(@RequestParam(required = false) String category) {
		return category == null ? signs.findAll() : signs.findByCategoryOrderByGloss(category);
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

	record CreateSignRequest(@NotBlank String gloss, @NotBlank String meaningVi, @NotBlank String category) {
	}
}
