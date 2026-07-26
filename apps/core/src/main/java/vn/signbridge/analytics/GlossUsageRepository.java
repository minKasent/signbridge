package vn.signbridge.analytics;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface GlossUsageRepository extends JpaRepository<GlossUsage, Long> {

	interface GlossCount {
		String getGloss();
		long getTotal();
	}

	long countByAtGreaterThanEqual(Instant since);

	@Query("select u.gloss as gloss, count(u) as total from GlossUsage u "
			+ "where u.at >= :since group by u.gloss order by count(u) desc, u.gloss")
	List<GlossCount> countByGlossSince(@Param("since") Instant since);

	/**
	 * Gộp theo ngày NGAY TRONG SQL (múi giờ VN cố định) — đọc hết mốc thời gian
	 * về JVM rồi group ở Java sẽ tải toàn bộ bảng, mà bảng này do endpoint
	 * WebSocket công khai sinh ra nên không giới hạn được kích thước.
	 *
	 * Trả Object[] thay vì interface projection: khai báo thêm một projection
	 * thứ hai trong repository này làm truy vấn JPQL bên trên trả rỗng (đã tái
	 * hiện bằng test tích hợp) — Object[] không đụng cơ chế projection nên an toàn.
	 * Mỗi phần tử: [0] ngày dạng chuỗi 'YYYY-MM-DD', [1] số lượng.
	 */
	@Query(value = "select to_char(u.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day, "
			+ "count(*) as total from gloss_usages u where u.at >= :sinceTs "
			+ "group by day order by day", nativeQuery = true)
	List<Object[]> countByDaySince(@Param("sinceTs") Instant sinceTs);
}
