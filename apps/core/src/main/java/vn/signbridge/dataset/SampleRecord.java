package vn.signbridge.dataset;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Metadata một mẫu ký hiệu đã thu (chuỗi keypoint). Dữ liệu frame thật nằm
 * trong file .json.gz trên filesystem (storage/dataset/) — DB chỉ giữ metadata.
 */
@Entity
@Table(name = "dataset_samples")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class SampleRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String gloss;

	/** Tên người góp mẫu (bạn bè tham gia thu — không bắt buộc đăng nhập). */
	@Column(nullable = false)
	private String signerName;

	@Column(nullable = false)
	private int frameCount;

	@Column(nullable = false)
	private int dims;

	@Column(nullable = false)
	private double fps;

	@Column(nullable = false)
	private String filePath;

	@Builder.Default
	@Column(nullable = false)
	private Instant createdAt = Instant.now();
}
