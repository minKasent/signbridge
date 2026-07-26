package vn.signbridge.translation;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Một câu tiếng Việt đã ghép được trong phiên (bảng `transcripts` trong PLAN §3).
 * Giữ lại cả chuỗi gloss gốc và nguồn ghép câu (llm/cache/fallback) để chương
 * đánh giá của báo cáo so được chất lượng LLM với cách ghép dự phòng.
 */
@Entity
@Table(name = "transcripts")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
class TranscriptRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private TranslationSessionRecord session;

	@Column(nullable = false, length = 1000)
	private String text;

	/** Chuỗi gloss gốc, nối bằng "/" — đủ dùng cho đối chiếu, không cần bảng riêng. */
	@Column(nullable = false, length = 1000)
	private String glosses;

	/** llm | cache | fallback */
	@Column(nullable = false)
	private String source;

	@Column(nullable = false)
	private Instant at;
}
