using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Auth;

public class RefreshTokenRequest
{
    [Required]
    public string RefreshToken { get; set; } = null!;
}