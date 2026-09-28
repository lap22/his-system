using HIS.Api.DTOs.DoctorSchedules;

namespace HIS.Api.Services;

public interface IDoctorScheduleService
{
    Task<List<DoctorScheduleResponse>> GetAllAsync(
        Guid? doctorId = null,
        DayOfWeek? dayOfWeek = null,
        bool? isActive = null);

    Task<DoctorScheduleResponse?> GetByIdAsync(Guid id);

    Task<DoctorScheduleResponse> CreateAsync(
        CreateDoctorScheduleRequest request);

    Task<DoctorScheduleResponse?> UpdateAsync(
        Guid id,
        UpdateDoctorScheduleRequest request);

    Task<DoctorScheduleResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDoctorScheduleStatusRequest request);
}