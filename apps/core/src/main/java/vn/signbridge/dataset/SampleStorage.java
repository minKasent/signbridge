package vn.signbridge.dataset;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;
import java.util.zip.GZIPOutputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

/**
 * Ghi chuỗi frame thành file .json.gz theo cấu trúc storage/dataset/{gloss}/{uuid}.json.gz
 *
 * Ghi vào file tạm rồi ATOMIC_MOVE: nếu đầy đĩa hoặc tiến trình chết giữa chừng thì
 * thư mục gloss không bao giờ chứa file .json.gz cụt (pipeline tiền xử lý đọc theo
 * glob, gặp gzip cụt là hỏng cả lượt trích landmark).
 */
@Component
class SampleStorage {

	private final Path datasetDir;
	private final ObjectMapper objectMapper;

	SampleStorage(@Value("${signbridge.storage.dataset-dir}") String datasetDir, ObjectMapper objectMapper)
			throws IOException {
		this.datasetDir = Path.of(datasetDir).toAbsolutePath().normalize();
		this.objectMapper = objectMapper;
		Files.createDirectories(this.datasetDir);
	}

	/**
	 * Ghi mẫu kèm metadata (signer để split signer-independent lúc huấn luyện).
	 *
	 * @param gloss đã được kiểm tra tồn tại trong từ điển và khớp [A-Z0-9_]+
	 */
	String store(String gloss, String signerName, double fps, List<double[]> frames) throws IOException {
		Path glossDir = datasetDir.resolve(gloss);
		Files.createDirectories(glossDir);
		Path target = glossDir.resolve(UUID.randomUUID() + ".json.gz");
		Path temp = Files.createTempFile(glossDir, ".tmp-", ".json.gz");
		try {
			try (OutputStream out = new GZIPOutputStream(Files.newOutputStream(temp))) {
				objectMapper.writeValue(out, java.util.Map.of(
						"gloss", gloss, "signer", signerName, "fps", fps, "frames", frames));
			}
			Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
		}
		catch (IOException | RuntimeException e) {
			Files.deleteIfExists(temp);
			throw e;
		}
		return datasetDir.relativize(target).toString().replace('\\', '/');
	}

	void delete(String relativePath) throws IOException {
		Files.deleteIfExists(datasetDir.resolve(relativePath));
	}
}
