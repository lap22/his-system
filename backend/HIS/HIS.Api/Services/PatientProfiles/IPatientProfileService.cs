using HIS.Api.DTOs.PatientProfiles;

namespace HIS.Api.Services.PatientProfiles;

public interface IPatientProfileService
{
    Task<List<PatientProfileResponse>> GetMyProfilesAsync(Guid userId);

    Task<PatientProfileResponse?> GetByIdAsync(
        Guid userId,
        Guid profileId);

    Task<PatientProfileResponse> CreateAsync(
        Guid userId,
        CreatePatientProfileRequest request);

    Task<PatientProfileResponse?> UpdateAsync(
        Guid userId,
        Guid profileId,
        UpdatePatientProfileRequest request);

    Task<bool> DeleteAsync(
        Guid userId,
        Guid profileId);
}