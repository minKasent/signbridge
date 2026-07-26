package vn.signbridge.dictionary;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Seed vài ký hiệu mẫu cho môi trường dev khi DB trống. */
@Component
@RequiredArgsConstructor
@Slf4j
class SignSeeder {

	private final SignRepository signs;

	@EventListener(ApplicationReadyEvent.class)
	void seed() {
		if (signs.count() > 0) {
			return;
		}
		signs.saveAll(java.util.List.of(
				Sign.builder().gloss("XIN_CHAO").meaningVi("xin chào").category("GREETING").build(),
				Sign.builder().gloss("CAM_ON").meaningVi("cảm ơn").category("GREETING").build(),
				Sign.builder().gloss("TOI").meaningVi("tôi").category("DAILY").build(),
				Sign.builder().gloss("BAN").meaningVi("bạn").category("DAILY").build(),
				Sign.builder().gloss("BAC_SI").meaningVi("bác sĩ").category("MEDICAL").build(),
				Sign.builder().gloss("DAU").meaningVi("đau").category("MEDICAL").build(),
				Sign.builder().gloss("KHAM_BENH").meaningVi("khám bệnh").category("MEDICAL").build(),
				Sign.builder().gloss("GIUP_DO").meaningVi("giúp đỡ").category("DAILY").build()));
		log.info("Đã seed {} ký hiệu mẫu vào từ điển", signs.count());
	}
}
