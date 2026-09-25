using HIS.Api.DTOs.Doctors;

namespace HIS.Api.Services.Doctors;

public interface IDoctorService
{
    Task<List<DoctorResponse>> GetAllAsync(
        Guid? departmentId = null,
        bool? isActive = null);

    Task<DoctorResponse?> GetByIdAsync(Guid id);

    Task<DoctorResponse> CreateAsync(
        CreateDoctorRequest request);

    Task<DoctorResponse?> UpdateAsync(
        Guid id,
        UpdateDoctorRequest request);

    Task<DoctorResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDoctorStatusRequest request);
}