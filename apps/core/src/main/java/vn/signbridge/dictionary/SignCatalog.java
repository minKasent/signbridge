package vn.signbridge.dictionary;

/**
 * API công khai của module dictionary cho các module khác (dataset dùng để kiểm tra
 * gloss hợp lệ trước khi lưu mẫu). Đây là bề mặt DUY NHẤT được phép gọi xuyên module —
 * repository và entity nội bộ vẫn đóng gói bên trong.
 */
public interface SignCatalog {

	boolean existsByGloss(String gloss);

	/** Nghĩa tiếng Việt của gloss, dùng khi LLM không khả dụng (ghép câu dự phòng). */
	java.util.Optional<String> meaningOf(String gloss);
}
