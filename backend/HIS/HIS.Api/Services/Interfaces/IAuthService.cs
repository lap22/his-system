using HIS.Api.DTOs.Auth;

namespace HIS.Api.Services.Interfaces;

public interface IAuthService
{
	Task<AuthResponse> RegisterAsync(
		RegisterRequest request
	);

	Task<AuthResponse> LoginAsync(
		LoginRequest request
	);
	Task<AuthResponse> RefreshTokenAsync(
	RefreshTokenRequest request
);

	Task LogoutAsync(
		LogoutRequest request
	);
}