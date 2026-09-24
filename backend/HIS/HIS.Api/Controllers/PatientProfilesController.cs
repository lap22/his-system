using System.Security.Claims;
using HIS.Api.DTOs.PatientProfiles;
using HIS.Api.Services.PatientProfiles;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/patient-profiles")]
[Authorize(Roles = "Patient")]
public class PatientProfilesController : ControllerBase
{
    private readonly IPatientProfileService _patientProfileService;

    public PatientProfilesController(
        IPatientProfileService patientProfileService)
    {
        _patientProfileService = patientProfileService;
    }

    [HttpGet]
    public async Task<ActionResult<List<PatientProfileResponse>>> GetMyProfiles()
    {
        var userId = GetCurrentUserId();

        var profiles =
            await _patientProfileService.GetMyProfilesAsync(userId);

        return Ok(profiles);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PatientProfileResponse>> GetById(
        Guid id)
    {
        var userId = GetCurrentUserId();

        var profile =
            await _patientProfileService.GetByIdAsync(
                userId,
                id);

        if (profile is null)
        {
            return NotFound();
        }

        return Ok(profile);
    }

    [HttpPost]
    public async Task<ActionResult<PatientProfileResponse>> Create(
        CreatePatientProfileRequest request)
    {
        var userId = GetCurrentUserId();

        var profile =
            await _patientProfileService.CreateAsync(
                userId,
                request);

        return CreatedAtAction(
            nameof(GetById),
            new { id = profile.Id },
            profile);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PatientProfileResponse>> Update(
        Guid id,
        UpdatePatientProfileRequest request)
    {
        var userId = GetCurrentUserId();

        var profile =
            await _patientProfileService.UpdateAsync(
                userId,
                id,
                request);

        if (profile is null)
        {
            return NotFound();
        }

        return Ok(profile);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetCurrentUserId();

        var deleted =
            await _patientProfileService.DeleteAsync(
                userId,
                id);

        if (!deleted)
        {
            return NotFound();
        }

        return NoContent();
    }

    private Guid GetCurrentUserId()
    {
        var userIdValue =
            User.FindFirstValue(
                ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(
                userIdValue,
                out var userId))
        {
            throw new UnauthorizedAccessException(
                "Invalid user identifier.");
        }

        return userId;
    }
}