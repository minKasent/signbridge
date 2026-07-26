package vn.signbridge.translation;

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
 * Một phiên phiên dịch đã kết thúc (bảng `sessions` trong PLAN §3).
 *
 * Chỉ ghi khi phiên có ít nhất một ký hiệu được nhận diện: endpoint WebSocket là
 * công khai, ghi cả những kết nối rỗng thì bảng đầy rác mà không nói lên điều gì.
 */
@Entity
@Table(name = "sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
class TranslationSessionRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/** Id phiên WebSocket — nối được với các bản ghi gloss_usages cùng phiên. */
	@Column(nullable = false)
	private String wsSessionId;

	@Column(nullable = false)
	private Instant startedAt;

	@Column(nullable = false)
	private Instant endedAt;

	/** Số ký hiệu nhận diện được trong phiên (kể cả những gloss chưa thành câu). */
	@Column(nullable = false)
	private int glossCount;

	@Column(nullable = false)
	private int sentenceCount;
}
