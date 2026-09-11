namespace HIS.Api.DTOs.Auth;

public class AuthResponse
{
    public Guid UserId { get; set; }

    public string Email { get; set; } = null!;

    public string Role { get; set; } = null!;

    public string AccessToken { get; set; } = null!;

    public string RefreshToken { get; set; } = null!;

    public DateTime AccessTokenExpiresAt { get; set; }
}