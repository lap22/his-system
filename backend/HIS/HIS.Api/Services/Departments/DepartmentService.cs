using HIS.Api.Data;
using HIS.Api.DTOs.Departments;
using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services.Departments;

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _dbContext;

    public DepartmentService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<DepartmentResponse>> GetAllAsync()
    {
        var departments = await _dbContext.Departments
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .ToListAsync();

        return departments
            .Select(MapToResponse)
            .ToList();
    }

    public async Task<DepartmentResponse?> GetByIdAsync(
        Guid id)
    {
        var department = await _dbContext.Departments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id);

        return department is null
            ? null
            : MapToResponse(department);
    }

    public async Task<DepartmentResponse> CreateAsync(
        CreateDepartmentRequest request)
    {
        var name = request.Name.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException(
                "Department name is required.");
        }

        var exists = await _dbContext.Departments
            .AnyAsync(x => x.Name == name);

        if (exists)
        {
            throw new InvalidOperationException(
                "Department name already exists.");
        }

        var department = new Department
        {
            Id = Guid.NewGuid(),

            Name = name,

            Description =
                NormalizeOptional(request.Description),

            IsActive = true,

            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Departments.Add(department);

        await _dbContext.SaveChangesAsync();

        return MapToResponse(department);
    }

    public async Task<DepartmentResponse?> UpdateAsync(
        Guid id,
        UpdateDepartmentRequest request)
    {
        var department = await _dbContext.Departments
            .FirstOrDefaultAsync(x => x.Id == id);

        if (department is null)
        {
            return null;
        }

        var name = request.Name.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException(
                "Department name is required.");
        }

        var duplicateName =
            await _dbContext.Departments
                .AnyAsync(x =>
                    x.Name == name &&
                    x.Id != id);

        if (duplicateName)
        {
            throw new InvalidOperationException(
                "Department name already exists.");
        }

        department.Name = name;

        department.Description =
            NormalizeOptional(request.Description);

        department.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(department);
    }

    public async Task<DepartmentResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDepartmentStatusRequest request)
    {
        var department = await _dbContext.Departments
            .FirstOrDefaultAsync(x => x.Id == id);

        if (department is null)
        {
            return null;
        }

        department.IsActive = request.IsActive;
        department.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(department);
    }

    private static string? NormalizeOptional(
        string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim();
    }

    private static DepartmentResponse MapToResponse(
        Department department)
    {
        return new DepartmentResponse
        {
            Id = department.Id,
            Name = department.Name,
            Description = department.Description,
            IsActive = department.IsActive,
            CreatedAt = department.CreatedAt,
            UpdatedAt = department.UpdatedAt
        };
    }
}