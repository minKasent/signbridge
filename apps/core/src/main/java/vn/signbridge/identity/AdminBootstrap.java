package vn.signbridge.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Tạo tài khoản ADMIN từ cấu hình (dev: application.yml, prod: biến môi trường
 * SIGNBRIDGE_SECURITY_ADMIN_EMAIL / _PASSWORD). Đây là con đường DUY NHẤT sinh ra
 * quyền ADMIN — API đăng ký công khai luôn chỉ cấp quyền USER.
 */
@Component
@RequiredArgsConstructor
@Slf4j
class AdminBootstrap {

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;

	@Value("${signbridge.security.admin-email:}")
	private String adminEmail;

	@Value("${signbridge.security.admin-password:}")
	private String adminPassword;

	@EventListener(ApplicationReadyEvent.class)
	void createAdminIfMissing() {
		if (adminEmail.isBlank() || adminPassword.isBlank()) {
			log.warn("Chưa cấu hình tài khoản admin (signbridge.security.admin-email/password) — bỏ qua bootstrap");
			return;
		}
		users.findByEmail(adminEmail).ifPresentOrElse(
				existing -> {
					if (existing.getRole() != Role.ADMIN) {
						// KHÔNG tự nâng quyền: nếu ai đó đã đăng ký trước bằng đúng email này
						// thì nâng quyền chính là trao quyền quản trị cho họ.
						log.error("Email quản trị {} đã tồn tại với quyền {} — đổi signbridge.security.admin-email "
								+ "hoặc xóa tài khoản đó rồi khởi động lại", adminEmail, existing.getRole());
					}
				},
				this::createAdmin);
	}

	private void createAdmin() {
		users.save(User.builder()
				.email(adminEmail)
				.passwordHash(passwordEncoder.encode(adminPassword))
				.displayName("Quản trị viên")
				.role(Role.ADMIN)
				.build());
		log.info("Đã tạo tài khoản quản trị: {}", adminEmail);
	}
}
