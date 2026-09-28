using HIS.Api.DTOs.DoctorSchedules;
using HIS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/doctor-schedules")]
[Authorize]
public class DoctorSchedulesController : ControllerBase
{
    private readonly IDoctorScheduleService _doctorScheduleService;

    public DoctorSchedulesController(
        IDoctorScheduleService doctorScheduleService)
    {
        _doctorScheduleService = doctorScheduleService;
    }

    // GET /api/doctor-schedules
    // GET /api/doctor-schedules?doctorId=...
    // GET /api/doctor-schedules?dayOfWeek=Monday
    // GET /api/doctor-schedules?isActive=true
    [HttpGet]
    public async Task<ActionResult<List<DoctorScheduleResponse>>> GetAll(
        [FromQuery] Guid? doctorId,
        [FromQuery] DayOfWeek? dayOfWeek,
        [FromQuery] bool? isActive)
    {
        var schedules = await _doctorScheduleService.GetAllAsync(
            doctorId,
            dayOfWeek,
            isActive);

        return Ok(schedules);
    }

    // GET /api/doctor-schedules/{id}
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DoctorScheduleResponse>> GetById(
        Guid id)
    {
        var schedule =
            await _doctorScheduleService.GetByIdAsync(id);

        if (schedule == null)
        {
            return NotFound();
        }

        return Ok(schedule);
    }

    // POST /api/doctor-schedules
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<DoctorScheduleResponse>> Create(
        CreateDoctorScheduleRequest request)
    {
        var schedule =
            await _doctorScheduleService.CreateAsync(request);

        return CreatedAtAction(
            nameof(GetById),
            new { id = schedule.Id },
            schedule);
    }

    // PUT /api/doctor-schedules/{id}
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<DoctorScheduleResponse>> Update(
        Guid id,
        UpdateDoctorScheduleRequest request)
    {
        var schedule =
            await _doctorScheduleService.UpdateAsync(id, request);

        if (schedule == null)
        {
            return NotFound();
        }

        return Ok(schedule);
    }

    // PATCH /api/doctor-schedules/{id}/status
    [HttpPatch("{id:guid}/status")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<DoctorScheduleResponse>> UpdateStatus(
        Guid id,
        UpdateDoctorScheduleStatusRequest request)
    {
        var schedule =
            await _doctorScheduleService.UpdateStatusAsync(id, request);

        if (schedule == null)
        {
            return NotFound();
        }

        return Ok(schedule);
    }
}