package vn.signbridge.identity;

import java.time.Duration;
import java.time.Instant;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
class TokenService {

	static final Duration TOKEN_TTL = Duration.ofHours(24);

	private final JwtEncoder jwtEncoder;

	String issue(User user) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer("signbridge")
				.subject(user.getEmail())
				.issuedAt(now)
				.expiresAt(now.plus(TOKEN_TTL))
				.claim("role", user.getRole().name())
				.claim("name", user.getDisplayName())
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}
}
