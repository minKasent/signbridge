package vn.signbridge.identity;

import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
class AuthController {

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokenService;

	/**
	 * Đăng ký công khai LUÔN tạo tài khoản quyền USER.
	 * Quyền ADMIN chỉ đến từ tài khoản bootstrap trong cấu hình (AdminBootstrap) —
	 * nếu để "người đăng ký đầu tiên thành ADMIN" thì bất kỳ ai tìm ra API trên
	 * một DB trống đều chiếm được quyền quản trị.
	 */
	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	AuthResponse register(@Valid @RequestBody RegisterRequest request) {
		if (users.existsByEmail(request.email())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Email đã được đăng ký");
		}
		try {
			User user = users.save(User.builder()
					.email(request.email())
					.passwordHash(passwordEncoder.encode(request.password()))
					.displayName(request.displayName())
					.role(Role.USER)
					.build());
			return AuthResponse.of(tokenService.issue(user), user);
		}
		catch (DataIntegrityViolationException e) {
			// Hai request cùng email chạy song song: cả hai qua được existsByEmail,
			// request thua cuộc phải trả 409 chứ không phải 500.
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Email đã được đăng ký");
		}
	}

	@PostMapping("/login")
	AuthResponse login(@Valid @RequestBody LoginRequest request) {
		User user = users.findByEmail(request.email())
				.filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.UNAUTHORIZED, "Sai email hoặc mật khẩu"));
		return AuthResponse.of(tokenService.issue(user), user);
	}

	@GetMapping("/me")
	Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
		if (jwt == null) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chưa đăng nhập");
		}
		return Map.of(
				"email", jwt.getSubject(),
				"name", jwt.getClaimAsString("name"),
				"role", jwt.getClaimAsString("role"));
	}

	record RegisterRequest(
			@NotBlank @Email String email,
			@NotBlank @Size(min = 8, message = "Mật khẩu tối thiểu 8 ký tự") String password,
			@NotBlank String displayName) {
	}

	record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
	}

	record AuthResponse(String token, long expiresInSeconds, String email, String name, String role) {

		static AuthResponse of(String token, User user) {
			return new AuthResponse(token, TokenService.TOKEN_TTL.toSeconds(),
					user.getEmail(), user.getDisplayName(), user.getRole().name());
		}
	}
}
