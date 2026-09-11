using HIS.Api.Entities;

namespace HIS.Api.Services.Interfaces;

public interface ITokenService
{
	string CreateAccessToken(User user);

	string CreateRefreshToken();

	DateTime GetAccessTokenExpiration();

	DateTime GetRefreshTokenExpiration();
}