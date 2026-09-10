using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/auth-test")]
public class AuthorizationTestController : ControllerBase
{
    [Authorize]
    [HttpGet("authenticated")]
    public IActionResult Authenticated()
    {
        return Ok(new
        {
            message = "Authenticated successfully."
        });
    }

    [Authorize(Roles = "Patient")]
    [HttpGet("patient")]
    public IActionResult Patient()
    {
        return Ok(new
        {
            message = "Patient access granted."
        });
    }

    [Authorize(Roles = "Doctor")]
    [HttpGet("doctor")]
    public IActionResult Doctor()
    {
        return Ok(new
        {
            message = "Doctor access granted."
        });
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin")]
    public IActionResult Admin()
    {
        return Ok(new
        {
            message = "Admin access granted."
        });
    }
}