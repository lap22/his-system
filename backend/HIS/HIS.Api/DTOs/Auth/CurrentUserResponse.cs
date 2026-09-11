namespace HIS.Api.DTOs.Auth;

public class CurrentUserResponse
{
    public Guid UserId { get; set; }

    public string Email { get; set; } = null!;

    public string Role { get; set; } = null!;
}