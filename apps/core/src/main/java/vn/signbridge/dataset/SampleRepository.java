package vn.signbridge.dataset;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface SampleRepository extends JpaRepository<SampleRecord, Long> {

	interface GlossCount {
		String getGloss();
		long getTotal();
	}

	@Query("select s.gloss as gloss, count(s) as total from SampleRecord s group by s.gloss order by s.gloss")
	List<GlossCount> countByGloss();
}
