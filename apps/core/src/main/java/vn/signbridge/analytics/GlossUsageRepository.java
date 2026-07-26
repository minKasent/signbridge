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

	@Query("select u.at from GlossUsage u where u.at >= :since")
	List<Instant> findTimesSince(@Param("since") Instant since);
}
