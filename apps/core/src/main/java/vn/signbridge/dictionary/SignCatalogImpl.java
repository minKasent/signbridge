package vn.signbridge.dictionary;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
class SignCatalogImpl implements SignCatalog {

	private final SignRepository signs;

	@Override
	public boolean existsByGloss(String gloss) {
		return signs.findByGloss(gloss).isPresent();
	}

	@Override
	public java.util.Optional<String> meaningOf(String gloss) {
		return signs.findByGloss(gloss).map(Sign::getMeaningVi);
	}
}
