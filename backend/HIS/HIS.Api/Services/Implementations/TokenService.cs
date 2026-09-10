using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using HIS.Api.Entities;
using HIS.Api.Services.Interfaces;
using HIS.Api.Settings;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace HIS.Api.Services.Implementations;

public class TokenService : ITokenService
{
    private readonly JwtSettings _jwtSettings;

    public TokenService(
        IOptions<JwtSettings> jwtOptions)
    {
        _jwtSettings = jwtOptions.Value;
    }

    public string CreateAccessToken(User user)
    {
        var claims = new List<Claim>
        {
            new(
                ClaimTypes.NameIdentifier,
                user.Id.ToString()
            ),

            new(
                ClaimTypes.Email,
                user.Email
            ),

            new(
                ClaimTypes.Role,
                user.Role.ToString()
            )
        };

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(
                _jwtSettings.Key
            )
        );

        var credentials = new SigningCredentials(
            key,
            SecurityAlgorithms.HmacSha256
        );

        var token = new JwtSecurityToken(
    issuer: _jwtSettings.Issuer,
    audience: _jwtSettings.Audience,
    claims: claims,
    expires: GetAccessTokenExpiration(),
    signingCredentials: credentials
);

        return new JwtSecurityTokenHandler()
            .WriteToken(token);
    }

    public string CreateRefreshToken()
    {
        var bytes = RandomNumberGenerator
            .GetBytes(64);

        return Convert.ToBase64String(bytes);
    }

    public DateTime GetAccessTokenExpiration()
    {
        return DateTime.UtcNow.AddMinutes(
            _jwtSettings.AccessTokenMinutes
        );
    }

    public DateTime GetRefreshTokenExpiration()
    {
        return DateTime.UtcNow.AddDays(
            _jwtSettings.RefreshTokenDays
        );
    }
}