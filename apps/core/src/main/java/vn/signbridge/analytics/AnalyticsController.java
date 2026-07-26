package vn.signbridge.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

/**
 * Số liệu sử dụng cho dashboard /stats.
 *
 * Ngày được gộp theo múi giờ Việt Nam CỐ ĐỊNH thay vì múi giờ hệ thống:
 * người xem dashboard ở VN còn server/container có thể chạy UTC — lấy TZ
 * hệ thống thì cùng một dữ liệu sẽ lệch ngày giữa máy dev và máy deploy.
 */
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
class AnalyticsController {

	private static final ZoneId ZONE_VN = ZoneId.of("Asia/Ho_Chi_Minh");
	private static final int MAX_DAYS = 90;

	private final GlossUsageRepository usages;

	@GetMapping("/summary")
	SummaryResponse summary(@RequestParam(defaultValue = "7") int days) {
		if (days < 1 || days > MAX_DAYS) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"days phải trong khoảng 1-%d".formatted(MAX_DAYS));
		}
		// "7 ngày" = hôm nay + 6 ngày trước, mốc 00:00 giờ VN
		Instant since = LocalDate.now(ZONE_VN).minusDays(days - 1L).atStartOfDay(ZONE_VN).toInstant();

		List<GlossEntry> byGloss = usages.countByGlossSince(since).stream()
				.map(c -> new GlossEntry(c.getGloss(), c.getTotal()))
				.toList();
		// Gộp theo ngày trong Java thay vì SQL: JPQL không có hàm cắt ngày theo
		// múi giờ, còn native query thì dính cú pháp riêng Postgres. Quy mô demo
		// (vài nghìn dòng/tuần) đủ nhỏ để đọc thẳng danh sách mốc thời gian.
		Map<LocalDate, Long> perDay = usages.findTimesSince(since).stream()
				.collect(Collectors.groupingBy(t -> LocalDate.ofInstant(t, ZONE_VN),
						TreeMap::new, Collectors.counting()));
		List<DayEntry> byDay = perDay.entrySet().stream()
				.map(e -> new DayEntry(e.getKey().toString(), e.getValue()))
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
