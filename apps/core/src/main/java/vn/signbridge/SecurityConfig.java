package vn.signbridge;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Bảo mật dùng chung (hạ tầng — không thuộc module nào).
 *
 * JWT resource server: decoder/encoder nằm ở module identity.
 * Quy tắc:
 *  - /api/auth/**, /ws/**, GET công khai (từ điển, clip) → mở
 *  - POST mẫu dataset → mở ở giai đoạn thu dữ liệu với bạn bè (ghi kèm tên người góp)
 *  - Ghi/sửa từ điển → ADMIN
 *  - Còn lại → cần đăng nhập
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
class SecurityConfig {

	@Bean
	SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
		http.csrf(csrf -> csrf.disable())
				.cors(Customizer.withDefaults())
				.authorizeHttpRequests(auth -> auth
						// /error: dispatch nội bộ khi controller trả 4xx/5xx — không mở thì
						// mọi lỗi validation bị Security chặn thành 401 (tìm ra qua test E2E)
						.requestMatchers("/api/auth/**", "/ws/**", "/actuator/health", "/error").permitAll()
						// Actuator còn lại (modulith, info, env…) lộ cấu trúc nội bộ —
						// USER tự đăng ký không được xem, chỉ ADMIN
						.requestMatchers("/actuator/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.GET, "/api/signs/**", "/clips/**", "/api/dataset/stats").permitAll()
						// Dashboard /stats đọc số liệu gộp (không dữ liệu cá nhân) — theo merge-notes B
						.requestMatchers(HttpMethod.GET, "/api/analytics/**").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/dataset/samples").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/signs/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.PUT, "/api/signs/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.DELETE, "/api/signs/**").hasRole("ADMIN")
						.anyRequest().authenticated())
				.oauth2ResourceServer(oauth2 -> oauth2
						.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
		return http.build();
	}

	/** Đọc quyền từ claim "role" của JWT → ROLE_ADMIN / ROLE_CONTRIBUTOR / ROLE_USER. */
	private JwtAuthenticationConverter jwtAuthenticationConverter() {
		JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
		authorities.setAuthoritiesClaimName("role");
		authorities.setAuthorityPrefix("ROLE_");
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(authorities);
		return converter;
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(List.of("http://localhost:3000"));
		config.setAllowedMethods(List.of("*"));
		config.setAllowedHeaders(List.of("*"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
