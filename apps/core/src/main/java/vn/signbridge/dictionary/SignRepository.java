package vn.signbridge.dictionary;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface SignRepository extends JpaRepository<Sign, Long> {

	Optional<Sign> findByGloss(String gloss);

	List<Sign> findByCategoryOrderByGloss(String category);
}
