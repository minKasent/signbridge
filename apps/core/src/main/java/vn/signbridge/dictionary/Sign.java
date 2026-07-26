package vn.signbridge.dictionary;

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
 * Một ký hiệu trong từ điển VSL.
 * gloss: nhãn chuẩn viết hoa, VD "XIN_CHAO" — trùng với nhãn model dự đoán.
 */
@Entity
@Table(name = "signs")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Sign {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String gloss;

	/** Nghĩa tiếng Việt tự nhiên, VD "xin chào". */
	@Column(nullable = false)
	private String meaningVi;

	/** Chủ đề: GREETING, MEDICAL, DAILY, ... */
	@Column(nullable = false)
	private String category;

	/** URL clip mẫu trên MinIO (null khi chưa quay). */
	private String clipUrl;

	@Builder.Default
	@Column(nullable = false)
	private Instant createdAt = Instant.now();
}
