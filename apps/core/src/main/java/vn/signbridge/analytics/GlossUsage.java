package vn.signbridge.analytics;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Một lần ký hiệu được nhận diện — nguồn số liệu thật cho dashboard /stats.
 * Ghi từ listener async (ngoài hot path phiên dịch), truy vấn gộp theo gloss/ngày.
 */
@Entity
@Table(name = "gloss_usages", indexes = @Index(name = "idx_gloss_usages_at", columnList = "at"))
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
class GlossUsage {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/** Id phiên WebSocket — cho phép tách "bao nhiêu phiên" khỏi "bao nhiêu gloss". */
	@Column(nullable = false)
	private String sessionId;

	@Column(nullable = false)
	private String gloss;

	@Column(nullable = false)
	private double confidence;

	@Column(nullable = false)
	private Instant at;
}
