using HIS.Api.DTOs.Appointments;
using HIS.Api.DTOs.Doctors;
using HIS.Api.Services;
using HIS.Api.Services.Doctors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/doctors")]
[Authorize]
public class DoctorsController : ControllerBase
{
    private readonly IDoctorService _doctorService;
    private readonly IAppointmentService _appointmentService;
    public DoctorsController(
        IDoctorService doctorService,
        IAppointmentService appointmentService)
    {
        _doctorService = doctorService;
        _appointmentService = appointmentService;
    }


    [HttpGet]
    public async Task<ActionResult<List<DoctorResponse>>>
        GetAll(
            [FromQuery] Guid? departmentId,
            [FromQuery] bool? isActive)
    {
        var doctors =
            await _doctorService.GetAllAsync(
                departmentId,
                isActive);

        return Ok(doctors);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DoctorResponse>>
        GetById(Guid id)
    {
        var doctor =
            await _doctorService.GetByIdAsync(id);

        if (doctor is null)
        {
            return NotFound();
        }

        return Ok(doctor);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<ActionResult<DoctorResponse>>
        Create(CreateDoctorRequest request)
    {
        var doctor =
            await _doctorService.CreateAsync(request);

        return CreatedAtAction(
            nameof(GetById),
            new { id = doctor.Id },
            doctor);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DoctorResponse>>
        Update(
            Guid id,
            UpdateDoctorRequest request)
    {
        var doctor =
            await _doctorService.UpdateAsync(
                id,
                request);

        if (doctor is null)
        {
            return NotFound();
        }

        return Ok(doctor);
    }

    [Authorize(Roles = "Admin")]
    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<DoctorResponse>>
        UpdateStatus(
            Guid id,
            UpdateDoctorStatusRequest request)
    {
        var doctor =
            await _doctorService.UpdateStatusAsync(
                id,
                request);

        if (doctor is null)
        {
            return NotFound();
        }

        return Ok(doctor);
    }
    [HttpGet("{doctorId:guid}/available-slots")]
    [Authorize]
    public async Task<ActionResult<List<AvailableSlotResponse>>>
    GetAvailableSlots(
        Guid doctorId,
        [FromQuery] DateOnly date)
    {
        var slots =
            await _appointmentService.GetAvailableSlotsAsync(
                doctorId,
                date);

        return Ok(slots);
    }
}