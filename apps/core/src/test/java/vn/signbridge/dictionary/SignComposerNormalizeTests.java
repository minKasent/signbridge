package vn.signbridge.dictionary;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SignComposerNormalizeTests {

	@Test
	void boDauCauVaGopKhoangTrang() {
		assertThat(SignComposer.normalize("Tôi  bị ĐAU BỤNG, bác sĩ ơi!"))
				.isEqualTo("tôi bị đau bụng bác sĩ ơi");
	}

	@Test
	void giuNguyenDauTiengViet() {
		assertThat(SignComposer.normalize("Tên là gì?")).isEqualTo("tên là gì");
	}
}
