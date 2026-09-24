using HIS.Api.DTOs.Departments;
using HIS.Api.Services.Departments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.Controllers;

[ApiController]
[Route("api/departments")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly IDepartmentService _departmentService;

    public DepartmentsController(
        IDepartmentService departmentService)
    {
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<ActionResult<List<DepartmentResponse>>>
        GetAll()
    {
        var departments =
            await _departmentService.GetAllAsync();

        return Ok(departments);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DepartmentResponse>>
        GetById(Guid id)
    {
        var department =
            await _departmentService.GetByIdAsync(id);

        if (department is null)
        {
            return NotFound();
        }

        return Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<ActionResult<DepartmentResponse>>
        Create(CreateDepartmentRequest request)
    {
        var department =
            await _departmentService.CreateAsync(request);

        return CreatedAtAction(
            nameof(GetById),
            new { id = department.Id },
            department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DepartmentResponse>>
        Update(
            Guid id,
            UpdateDepartmentRequest request)
    {
        var department =
            await _departmentService.UpdateAsync(
                id,
                request);

        if (department is null)
        {
            return NotFound();
        }

        return Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<DepartmentResponse>>
        UpdateStatus(
            Guid id,
            UpdateDepartmentStatusRequest request)
    {
        var department =
            await _departmentService.UpdateStatusAsync(
                id,
                request);

        if (department is null)
        {
            return NotFound();
        }

        return Ok(department);
    }
}