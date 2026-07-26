package vn.signbridge.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

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
	private static final String ROLE_ADMIN = "ROLE_ADMIN";

	private final GlossUsageRepository usages;
	private final ModelMetricRepository modelMetrics;
	private final TransactionTemplate readOnlyTransactions;

	AnalyticsController(GlossUsageRepository usages, ModelMetricRepository modelMetrics,
			PlatformTransactionManager transactionManager) {
		this.usages = usages;
		this.modelMetrics = modelMetrics;
		this.readOnlyTransactions = new TransactionTemplate(transactionManager);
		this.readOnlyTransactions.setReadOnly(true);
		// READ COMMITTED (mặc định của Postgres) cấp snapshot MỚI cho TỪNG câu lệnh:
		// listener analytics ghi bất đồng bộ nên giữa hai truy vấn có thể có commit
		// chen vào, làm tổng và chi tiết trong cùng một phản hồi vênh nhau
		// (đã tái hiện: count()=0 trong khi truy vấn kế tiếp thấy dữ liệu).
		// REPEATABLE READ khóa một snapshot cho cả các truy vấn.
		this.readOnlyTransactions.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
	}

	/**
	 * Các truy vấn phải nằm TRONG MỘT giao dịch đọc: không có nó, mỗi truy vấn tự
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

	/** Lịch sử accuracy theo version — chỗ đọc kết quả huấn luyện cho báo cáo. */
	@GetMapping("/model-metrics")
	List<ModelMetricResponse> listModelMetrics() {
		return modelMetrics.findAllByOrderByRecordedAtDesc().stream()
				.map(m -> new ModelMetricResponse(m.getId(), m.getVersion(), m.getAccuracy(),
						m.getTop5Accuracy(), m.getNumClasses(), m.getNote(), m.getRecordedAt()))
				.toList();
	}

	/**
	 * Ghi kết quả một vòng huấn luyện (pipeline training gọi sau khi đánh giá xong).
	 *
	 * Kiểm quyền ADMIN NGAY TRONG THÂN HÀM chứ không dùng @PreAuthorize: method
	 * security của Spring chỉ chặn được method public, controller ở đây là
	 * package-private nên annotation sẽ bị bỏ qua âm thầm — endpoint hóa ra mở cho
	 * mọi tài khoản đã đăng nhập. SecurityConfig chỉ bắt buộc "đã đăng nhập" cho
	 * đường này (không sửa file dùng chung), phần còn lại kiểm ở đây.
	 */
	@PostMapping("/model-metrics")
	@ResponseStatus(HttpStatus.CREATED)
	ModelMetricResponse recordModelMetric(@Valid @RequestBody ModelMetricRequest request,
			Authentication authentication) {
		boolean admin = authentication != null && authentication.getAuthorities().stream()
				.map(GrantedAuthority::getAuthority)
				.anyMatch(ROLE_ADMIN::equals);
		if (!admin) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN,
					"Chỉ quản trị viên được ghi kết quả huấn luyện");
		}
		ModelMetric saved = modelMetrics.save(ModelMetric.builder()
				.version(request.version())
				.accuracy(request.accuracy())
				.top5Accuracy(request.top5Accuracy())
				.numClasses(request.numClasses())
				.note(request.note())
				.recordedAt(Instant.now())
				.build());
		return new ModelMetricResponse(saved.getId(), saved.getVersion(), saved.getAccuracy(),
				saved.getTop5Accuracy(), saved.getNumClasses(), saved.getNote(), saved.getRecordedAt());
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

		return new SummaryResponse(usages.countByAtGreaterThanEqual(since), byGloss, byDay, latency(since));
	}

	/** Trả null khi chưa đo được mẫu nào — dashboard hiện "—" thay vì số 0 gây hiểu nhầm. */
	private LatencyResponse latency(Instant since) {
		List<Object[]> rows = usages.latencyPercentilesSince(since);
		if (rows.isEmpty()) {
			return null;
		}
		Object[] row = rows.get(0);
		long samples = row[2] == null ? 0 : ((Number) row[2]).longValue();
		if (samples == 0 || row[0] == null) {
			return null;
		}
		return new LatencyResponse(
				round1(((Number) row[0]).doubleValue()),
				row[1] == null ? null : round1(((Number) row[1]).doubleValue()),
				samples);
	}

	private static double round1(double value) {
		return Math.round(value * 10.0) / 10.0;
	}

	record GlossEntry(String gloss, long count) {
	}

	record DayEntry(String date, long count) {
	}

	/** @param samples số gloss có đo được độ trễ trong khoảng đang xem */
	record LatencyResponse(double p50, Double p95, long samples) {
	}

	record SummaryResponse(long totalGlosses, List<GlossEntry> byGloss, List<DayEntry> byDay,
			LatencyResponse latency) {
	}

	record ModelMetricResponse(Long id, String version, double accuracy, Double top5Accuracy,
			Integer numClasses, String note, Instant recordedAt) {
	}

	record ModelMetricRequest(
			@NotBlank @Size(max = 100) String version,
			@DecimalMin("0.0") @DecimalMax("1.0") double accuracy,
			@DecimalMin("0.0") @DecimalMax("1.0") Double top5Accuracy,
			@Positive Integer numClasses,
			@Size(max = 500) String note) {
	}
}
