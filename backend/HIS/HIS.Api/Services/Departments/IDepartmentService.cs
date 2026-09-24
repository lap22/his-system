using HIS.Api.DTOs.Departments;

namespace HIS.Api.Services.Departments;

public interface IDepartmentService
{
    Task<List<DepartmentResponse>> GetAllAsync();

    Task<DepartmentResponse?> GetByIdAsync(Guid id);

    Task<DepartmentResponse> CreateAsync(
        CreateDepartmentRequest request);

    Task<DepartmentResponse?> UpdateAsync(
        Guid id,
        UpdateDepartmentRequest request);

    Task<DepartmentResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDepartmentStatusRequest request);
}