using System.Security.Claims;
using HIS.Api.DTOs.Appointments;
using HIS.Api.Enums;
using HIS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AppointmentsController : ControllerBase
{
    private readonly IAppointmentService _appointmentService;

    public AppointmentsController(
        IAppointmentService appointmentService)
    {
        _appointmentService = appointmentService;
    }

    // =========================================================
    // PATIENT - Create appointment
    // =========================================================

    [HttpPost]
    [Authorize(Roles = "Patient")]
    public async Task<ActionResult<AppointmentResponse>> Create(
        [FromBody] CreateAppointmentRequest request)
    {
        var userId = GetCurrentUserId();

        var appointment = await _appointmentService.CreateAsync(
            userId,
            request);

        return CreatedAtAction(
            nameof(GetById),
            new { id = appointment.Id },
            appointment);
    }

    // =========================================================
    // PATIENT - My appointments
    // =========================================================

    [HttpGet("my")]
    [Authorize(Roles = "Patient")]
    public async Task<ActionResult<List<AppointmentResponse>>>
        GetMyAppointments()
    {
        var userId = GetCurrentUserId();

        var appointments =
            await _appointmentService.GetMyAppointmentsAsync(userId);

        return Ok(appointments);
    }

    // =========================================================
    // Patient / Doctor / Admin - Appointment detail
    // =========================================================

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AppointmentResponse>> GetById(
        Guid id)
    {
        var userId = GetCurrentUserId();
        var role = GetCurrentUserRole();

        var appointment =
            await _appointmentService.GetByIdAsync(
                userId,
                id,
                role);

        if (appointment is null)
            return NotFound();

        return Ok(appointment);
    }

    // =========================================================
    // PATIENT - Cancel appointment
    // =========================================================

    [HttpPatch("{id:guid}/cancel")]
    [Authorize(Roles = "Patient")]
    public async Task<ActionResult<AppointmentResponse>> Cancel(
        Guid id,
        [FromBody] CancelAppointmentRequest request)
    {
        var userId = GetCurrentUserId();

        var appointment =
            await _appointmentService.CancelAsync(
                userId,
                id,
                request);

        if (appointment is null)
            return NotFound();

        return Ok(appointment);
    }

    // =========================================================
    // DOCTOR - Own appointments
    // =========================================================

    [HttpGet]
    [Authorize(Roles = "Doctor")]
    public async Task<ActionResult<List<AppointmentResponse>>>
        GetDoctorAppointments(
            [FromQuery] DateOnly? date,
            [FromQuery] AppointmentStatus? status)
    {
        var userId = GetCurrentUserId();

        var appointments =
            await _appointmentService.GetDoctorAppointmentsAsync(
                userId,
                date,
                status);

        return Ok(appointments);
    }

    // =========================================================
    // DOCTOR / ADMIN - Confirm
    // =========================================================

    [HttpPatch("{id:guid}/confirm")]
    [Authorize(Roles = "Doctor,Admin")]
    public async Task<ActionResult<AppointmentResponse>> Confirm(
        Guid id)
    {
        var userId = GetCurrentUserId();
        var role = GetCurrentUserRole();

        var appointment =
            await _appointmentService.ConfirmAsync(
                userId,
                id,
                role);

        if (appointment is null)
            return NotFound();

        return Ok(appointment);
    }

    // =========================================================
    // JWT helpers
    // =========================================================

    private Guid GetCurrentUserId()
    {
        var value = User.FindFirstValue(
            ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(value, out var userId))
            throw new UnauthorizedAccessException(
                "Invalid user token.");

        return userId;
    }

    private string GetCurrentUserRole()
    {
        var role = User.FindFirstValue(
            ClaimTypes.Role);

        if (string.IsNullOrWhiteSpace(role))
            throw new UnauthorizedAccessException(
                "Invalid user role.");

        return role;
    }
}