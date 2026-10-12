using System.Security.Claims;
using HIS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class QueueController : ControllerBase
{
    private readonly IQueueService _queueService;

    public QueueController(IQueueService queueService)
    {
        _queueService = queueService;
    }

    private Guid GetCurrentUserId()
    {
        var value = User.FindFirstValue(
            ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(value, out var userId))
            throw new UnauthorizedAccessException(
                "Invalid user token.");

        return userId;
    }

    // PATIENT: Check-in appointment
    [HttpPost("check-in/{appointmentId:guid}")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> CheckIn(Guid appointmentId)
    {
        var result = await _queueService.CheckInAsync(
            GetCurrentUserId(),
            appointmentId);

        return Ok(result);
    }

    // PATIENT: View queue entries of own patient profiles
    [HttpGet("my")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> GetMyQueue()
    {
        var result = await _queueService.GetMyQueueAsync(
            GetCurrentUserId());

        return Ok(result);
    }

    // DOCTOR: View own queue
    [HttpGet("doctor")]
    [Authorize(Roles = "Doctor")]
    public async Task<IActionResult> GetDoctorQueue(
        [FromQuery] DateOnly? date)
    {
        var result = await _queueService.GetDoctorQueueAsync(
            GetCurrentUserId(),
            date);

        return Ok(result);
    }

    // DOCTOR: Call patient
    [HttpPut("{queueEntryId:guid}/call")]
    [Authorize(Roles = "Doctor")]
    public async Task<IActionResult> Call(Guid queueEntryId)
    {
        var result = await _queueService.CallAsync(
            GetCurrentUserId(),
            queueEntryId);

        if (result == null)
        {
            return NotFound();
        }

        return Ok(result);
    }

    // DOCTOR: Start examination
    [HttpPut("{queueEntryId:guid}/start")]
    [Authorize(Roles = "Doctor")]
    public async Task<IActionResult> Start(Guid queueEntryId)
    {
        var result = await _queueService.StartAsync(
            GetCurrentUserId(),
            queueEntryId);

        if (result == null)
        {
            return NotFound();
        }

        return Ok(result);
    }

    // DOCTOR: Complete examination
    [HttpPut("{queueEntryId:guid}/complete")]
    [Authorize(Roles = "Doctor")]
    public async Task<IActionResult> Complete(Guid queueEntryId)
    {
        var result = await _queueService.CompleteAsync(
            GetCurrentUserId(),
            queueEntryId);

        if (result == null)
        {
            return NotFound();
        }

        return Ok(result);
    }
}