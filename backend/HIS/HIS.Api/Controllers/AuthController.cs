using HIS.Api.DTOs.Auth;
using HIS.Api.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
namespace HIS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
	private readonly IAuthService _authService;

	public AuthController(
		IAuthService authService)
	{
		_authService = authService;
	}

	[HttpPost("register")]
    public async Task<IActionResult> Register(
    RegisterRequest request)
    {
        var result =
            await _authService.RegisterAsync(request);

        return Ok(result);
    }


    [HttpPost("login")]
    public async Task<IActionResult> Login(
    LoginRequest request)
    {
        var result =
            await _authService.LoginAsync(request);

        return Ok(result);
    }
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(
    RefreshTokenRequest request)
    {
        var result =
            await _authService.RefreshTokenAsync(
                request
            );

        return Ok(result);
    }

    [HttpPost("logout")]
    
    public async Task<IActionResult> Logout(
    LogoutRequest request)
    {
        await _authService.LogoutAsync(request);

        return Ok(new
        {
            message = "Logged out successfully."
        });
    }
    [Authorize]
    [HttpGet("me")]
   
    public IActionResult Me()
    {
        var userIdValue =
            User.FindFirstValue(
                ClaimTypes.NameIdentifier
            );

        var email =
            User.FindFirstValue(
                ClaimTypes.Email
            );

        var role =
            User.FindFirstValue(
                ClaimTypes.Role
            );

        if (!Guid.TryParse(
                userIdValue,
                out var userId))
        {
            return Unauthorized();
        }

        return Ok(
            new CurrentUserResponse
            {
                UserId = userId,
                Email = email ?? string.Empty,
                Role = role ?? string.Empty
            }
        );
    }
}