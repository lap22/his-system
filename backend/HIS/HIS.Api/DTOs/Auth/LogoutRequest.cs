using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Auth;

public class LogoutRequest
{
    [Required]
    public string RefreshToken { get; set; } = null!;
}