package vn.signbridge.dictionary;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Lưu clip mẫu ký hiệu vào filesystem (KHÔNG dùng MinIO — repo đã archive 04/2026).
 * Serve tĩnh tại /clips/**.
 *
 * Tên file lấy theo ID của ký hiệu, KHÔNG theo gloss: gloss tiếng Việt có dấu, nếu
 * lọc ký tự để đặt tên thì "CHÀO" và "CHO" ra cùng một tên và clip này ghi đè clip kia.
 */
@Component
class ClipStorage {

	private final Path clipsDir;

	ClipStorage(@Value("${signbridge.storage.clips-dir}") String clipsDir) throws IOException {
		this.clipsDir = Path.of(clipsDir).toAbsolutePath().normalize();
		Files.createDirectories(this.clipsDir);
	}

	/** Lưu clip cho một ký hiệu, trả về đường dẫn public (/clips/...). */
	String store(long signId, MultipartFile file) throws IOException {
		String extension = switch (file.getContentType() == null ? "" : file.getContentType()) {
			case "video/webm" -> ".webm";
			case "video/mp4" -> ".mp4";
			default -> throw new IllegalArgumentException("Chỉ nhận video/webm hoặc video/mp4");
		};
		String filename = "sign-" + signId + extension;
		Path target = clipsDir.resolve(filename);
		Path temp = Files.createTempFile(clipsDir, ".tmp-", extension);
		try {
			Files.copy(file.getInputStream(), temp, StandardCopyOption.REPLACE_EXISTING);
			Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
		}
		catch (IOException | RuntimeException e) {
			Files.deleteIfExists(temp);
			throw e;
		}
		return "/clips/" + filename;
	}

	@Configuration
	static class StaticClipConfig implements WebMvcConfigurer {

		private final String clipsLocation;

		StaticClipConfig(@Value("${signbridge.storage.clips-dir}") String clipsDir) {
			this.clipsLocation = Path.of(clipsDir).toAbsolutePath().normalize().toUri().toString();
		}

		@Override
		public void addResourceHandlers(ResourceHandlerRegistry registry) {
			registry.addResourceHandler("/clips/**").addResourceLocations(clipsLocation);
		}
	}
}
