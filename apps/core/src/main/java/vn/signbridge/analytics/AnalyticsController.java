package vn.signbridge.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Số liệu sử dụng cho dashboard /stats.
 *
 * Ngày được gộp theo múi giờ Việt Nam CỐ ĐỊNH thay vì múi giờ hệ thống:
 * người xem dashboard ở VN còn server/container có thể chạy UTC — lấy TZ
 * hệ thống thì cùng một dữ liệu sẽ lệch ngày giữa máy dev và máy deploy.
 */
@RestController
@RequestMapping("/api/analytics")
class AnalyticsController {

	private static final ZoneId ZONE_VN = ZoneId.of("Asia/Ho_Chi_Minh");
	private static final int MAX_DAYS = 90;

	private final GlossUsageRepository usages;
	private final TransactionTemplate readOnlyTransactions;

	AnalyticsController(GlossUsageRepository usages, PlatformTransactionManager transactionManager) {
		this.usages = usages;
		this.readOnlyTransactions = new TransactionTemplate(transactionManager);
		this.readOnlyTransactions.setReadOnly(true);
		// READ COMMITTED (mặc định của Postgres) cấp snapshot MỚI cho TỪNG câu lệnh:
		// listener analytics ghi bất đồng bộ nên giữa hai truy vấn có thể có commit
		// chen vào, làm tổng và chi tiết trong cùng một phản hồi vênh nhau
		// (đã tái hiện: count()=0 trong khi truy vấn kế tiếp thấy dữ liệu).
		// REPEATABLE READ khóa một snapshot cho cả ba truy vấn.
		this.readOnlyTransactions.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
	}

	/**
	 * Ba truy vấn phải nằm TRONG MỘT giao dịch đọc: không có nó, mỗi truy vấn tự
	 * mở giao dịch riêng và thấy ảnh chụp DB khác nhau — listener analytics ghi
	 * bất đồng bộ nên tổng có thể là 3 trong khi chi tiết theo gloss vẫn rỗng,
	 * dashboard hiện số tự mâu thuẫn (test tích hợp bắt được đúng cảnh này).
	 *
	 * Dùng TransactionTemplate chứ KHÔNG dùng @Transactional: controller ở đây là
	 * package-private theo quy ước dự án, mà AOP proxy của Spring chỉ áp
	 * @Transactional cho method public — annotation sẽ bị bỏ qua trong im lặng.
	 */
	@GetMapping("/summary")
	SummaryResponse summary(@RequestParam(defaultValue = "7") int days) {
		if (days < 1 || days > MAX_DAYS) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"days phải trong khoảng 1-%d".formatted(MAX_DAYS));
		}
		// "7 ngày" = hôm nay + 6 ngày trước, mốc 00:00 giờ VN
		Instant since = LocalDate.now(ZONE_VN).minusDays(days - 1L).atStartOfDay(ZONE_VN).toInstant();
		return readOnlyTransactions.execute(tx -> buildSummary(since));
	}

	private SummaryResponse buildSummary(Instant since) {
		List<GlossEntry> byGloss = usages.countByGlossSince(since).stream()
				.map(c -> new GlossEntry(c.getGloss(), c.getTotal()))
				.toList();
		// Gộp theo ngày trong SQL (Postgres to_char + at time zone) — bảng này do
		// endpoint WebSocket công khai sinh ra nên không được phép quét cả bảng
		// về JVM chỉ để đếm.
		List<DayEntry> byDay = usages.countByDaySince(since).stream()
				.map(row -> new DayEntry((String) row[0], ((Number) row[1]).longValue()))
				.toList();

		return new SummaryResponse(usages.countByAtGreaterThanEqual(since), byGloss, byDay);
	}

	record GlossEntry(String gloss, long count) {
	}

	record DayEntry(String date, long count) {
	}

	record SummaryResponse(long totalGlosses, List<GlossEntry> byGloss, List<DayEntry> byDay) {
	}
}
