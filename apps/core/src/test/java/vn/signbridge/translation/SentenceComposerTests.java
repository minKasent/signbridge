package vn.signbridge.translation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import vn.signbridge.dictionary.SignCatalog;

/**
 * Kiểm tra đường dự phòng của bộ ghép câu: KHÔNG có key LLM thì hệ thống vẫn
 * phải ra một câu đọc được từ nghĩa trong từ điển — đây là lớp bảo hiểm cho
 * buổi bảo vệ khi mạng/quota có vấn đề.
 */
class SentenceComposerTests {

	private final SignCatalog catalog = new SignCatalog() {

		@Override
		public boolean existsByGloss(String gloss) {
			return meaningOf(gloss).isPresent();
		}

		@Override
		public Optional<String> meaningOf(String gloss) {
			return switch (gloss) {
				case "TOI" -> Optional.of("tôi");
				case "CAN" -> Optional.of("cần");
				case "BAC_SI" -> Optional.of("bác sĩ");
				default -> Optional.empty();
			};
		}
	};

	/** api-key rỗng → không gọi mạng, đi thẳng nhánh dự phòng. */
	private SentenceComposer composerWithoutLlm() {
		return new SentenceComposer(catalog, "http://localhost:1", "gemini-flash-latest", "", 1);
	}

	@Test
	void ghepCauDuPhongTuNghiaTrongTuDien() {
		SentenceComposer.Sentence sentence = composerWithoutLlm().compose(List.of("TOI", "CAN", "BAC_SI"));

		assertThat(sentence.source()).isEqualTo("fallback");
		assertThat(sentence.text()).isEqualTo("Tôi cần bác sĩ.");
		assertThat(sentence.glosses()).containsExactly("TOI", "CAN", "BAC_SI");
	}

	@Test
	void glossLaTuDienKhongCoThiDungChinhNhanDaLamMem() {
		SentenceComposer.Sentence sentence = composerWithoutLlm().compose(List.of("XIN_CHAO"));

		assertThat(sentence.text()).isEqualTo("Xin chao.");
	}

	@Test
	void chuoiGlossRongTraVeCauRong() {
		assertThat(composerWithoutLlm().compose(List.of()).text()).isEmpty();
	}
}
