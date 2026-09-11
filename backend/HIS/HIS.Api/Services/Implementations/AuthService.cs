using HIS.Api.Data;
using HIS.Api.DTOs.Auth;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly AppDbContext _dbContext;
    private readonly ITokenService _tokenService;

    public AuthService(
        AppDbContext dbContext,
        ITokenService tokenService)
    {
        _dbContext = dbContext;
        _tokenService = tokenService;
    }

    public async Task<AuthResponse> RegisterAsync(
        RegisterRequest request)
    {
        var email = request.Email
            .Trim()
            .ToLowerInvariant();

        var emailExists =
            await _dbContext.Users
                .AnyAsync(x => x.Email == email);

        if (emailExists)
        {
            throw new InvalidOperationException(
                "Email is already registered."
            );
        }

        var user = new User
        {
            Email = email,

            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(
                    request.Password
                ),

            Role = UserRole.Patient,
            IsActive = true
        };

        var refreshTokenValue =
            _tokenService.CreateRefreshToken();

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,

            ExpiresAt =
                _tokenService
                    .GetRefreshTokenExpiration()
        };

        user.RefreshTokens.Add(refreshToken);

        _dbContext.Users.Add(user);

        await _dbContext.SaveChangesAsync();

        return CreateAuthResponse(
            user,
            refreshTokenValue
        );
    }

    public async Task<AuthResponse> LoginAsync(
        LoginRequest request)
    {
        var email = request.Email
            .Trim()
            .ToLowerInvariant();

        var user =
            await _dbContext.Users
                .FirstOrDefaultAsync(
                    x => x.Email == email
                );

        if (user is null)
        {
            throw new UnauthorizedAccessException(
                "Invalid email or password."
            );
        }

        if (!user.IsActive)
        {
            throw new UnauthorizedAccessException(
                "Account is disabled."
            );
        }

        var passwordValid =
            BCrypt.Net.BCrypt.Verify(
                request.Password,
                user.PasswordHash
            );

        if (!passwordValid)
        {
            throw new UnauthorizedAccessException(
                "Invalid email or password."
            );
        }

        var refreshTokenValue =
            _tokenService.CreateRefreshToken();

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,

            Token = refreshTokenValue,

            ExpiresAt =
                _tokenService
                    .GetRefreshTokenExpiration()
        };

        _dbContext.RefreshTokens.Add(
            refreshToken
        );

        await _dbContext.SaveChangesAsync();

        return CreateAuthResponse(
            user,
            refreshTokenValue
        );
    }

    private AuthResponse CreateAuthResponse(
        User user,
        string refreshToken)
    {
        return new AuthResponse
        {
            UserId = user.Id,
            Email = user.Email,
            Role = user.Role.ToString(),

            AccessToken =
                _tokenService
                    .CreateAccessToken(user),

            RefreshToken = refreshToken,

            AccessTokenExpiresAt =
                _tokenService
                    .GetAccessTokenExpiration()
        };
    }
    public async Task<AuthResponse> RefreshTokenAsync(
    RefreshTokenRequest request)
    {
        var storedToken =
            await _dbContext.RefreshTokens
                .Include(x => x.User)
                .FirstOrDefaultAsync(
                    x => x.Token == request.RefreshToken
                );

        if (storedToken is null ||
            storedToken.IsRevoked ||
            storedToken.IsExpired)
        {
            throw new UnauthorizedAccessException(
                "Invalid or expired refresh token."
            );
        }

        var user = storedToken.User;

        if (!user.IsActive)
        {
            throw new UnauthorizedAccessException(
                "Account is disabled."
            );
        }

        // Revoke old refresh token
        storedToken.RevokedAt = DateTime.UtcNow;

        // Generate new refresh token
        var newRefreshTokenValue =
            _tokenService.CreateRefreshToken();

        var newRefreshToken = new RefreshToken
        {
            UserId = user.Id,

            Token = newRefreshTokenValue,

            ExpiresAt =
                _tokenService.GetRefreshTokenExpiration()
        };

        _dbContext.RefreshTokens.Add(newRefreshToken);

        await _dbContext.SaveChangesAsync();

        return CreateAuthResponse(
            user,
            newRefreshTokenValue
        );
    }
    public async Task LogoutAsync(
    LogoutRequest request)
    {
        var storedToken =
            await _dbContext.RefreshTokens
                .FirstOrDefaultAsync(
                    x => x.Token == request.RefreshToken
                );

        if (storedToken is null)
        {
            return;
        }

        if (!storedToken.IsRevoked)
        {
            storedToken.RevokedAt =
                DateTime.UtcNow;

            await _dbContext.SaveChangesAsync();
        }
    }
}