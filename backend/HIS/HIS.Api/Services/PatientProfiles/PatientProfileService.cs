using HIS.Api.Data;
using HIS.Api.DTOs.PatientProfiles;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services.PatientProfiles;

public class PatientProfileService : IPatientProfileService
{
    private readonly AppDbContext _dbContext;

    public PatientProfileService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<PatientProfileResponse>> GetMyProfilesAsync(
        Guid userId)
    {
        var profiles = await _dbContext.PatientProfiles
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.CreatedAt)
            .ToListAsync();

        return profiles
            .Select(MapToResponse)
            .ToList();
    }

    public async Task<PatientProfileResponse?> GetByIdAsync(
        Guid userId,
        Guid profileId)
    {
        var profile = await _dbContext.PatientProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == profileId &&
                x.UserId == userId);

        return profile is null
            ? null
            : MapToResponse(profile);
    }

    public async Task<PatientProfileResponse> CreateAsync(
        Guid userId,
        CreatePatientProfileRequest request)
    {
        ValidateRequest(
            request.DateOfBirth,
            request.Gender,
            request.BloodType);

        if (request.Relationship == RelationshipType.Self)
        {
            var alreadyHasSelf = await _dbContext.PatientProfiles
                .AnyAsync(x =>
                    x.UserId == userId &&
                    x.Relationship == RelationshipType.Self);

            if (alreadyHasSelf)
            {
                throw new InvalidOperationException(
                    "User already has a self patient profile.");
            }
        }

        var hasAnyProfile = await _dbContext.PatientProfiles
            .AnyAsync(x => x.UserId == userId);

        if (request.IsDefault)
        {
            await ClearDefaultProfileAsync(userId);
        }

        var profile = new PatientProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,

            FullName = request.FullName.Trim(),

            DateOfBirth = request.DateOfBirth,

            Gender = NormalizeGender(request.Gender),

            Phone = NormalizeOptional(request.Phone),

            Address = NormalizeOptional(request.Address),

            BloodType = NormalizeBloodType(request.BloodType),

            Relationship = request.Relationship,

            IsDefault =
                !hasAnyProfile || request.IsDefault,

            CreatedAt = DateTime.UtcNow
        };

        _dbContext.PatientProfiles.Add(profile);

        await _dbContext.SaveChangesAsync();

        return MapToResponse(profile);
    }

    public async Task<PatientProfileResponse?> UpdateAsync(
        Guid userId,
        Guid profileId,
        UpdatePatientProfileRequest request)
    {
        ValidateRequest(
            request.DateOfBirth,
            request.Gender,
            request.BloodType);

        var profile = await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(x =>
                x.Id == profileId &&
                x.UserId == userId);

        if (profile is null)
        {
            return null;
        }

        if (request.Relationship == RelationshipType.Self &&
            profile.Relationship != RelationshipType.Self)
        {
            var alreadyHasSelf =
                await _dbContext.PatientProfiles
                    .AnyAsync(x =>
                        x.UserId == userId &&
                        x.Relationship == RelationshipType.Self &&
                        x.Id != profileId);

            if (alreadyHasSelf)
            {
                throw new InvalidOperationException(
                    "User already has a self patient profile.");
            }
        }

        if (request.IsDefault &&
    !profile.IsDefault)
        {
            await ClearDefaultProfileAsync(
                userId,
                profileId);
        }

        profile.FullName = request.FullName.Trim();
        profile.DateOfBirth = request.DateOfBirth;
        profile.Gender = NormalizeGender(request.Gender);
        profile.Phone = NormalizeOptional(request.Phone);
        profile.Address = NormalizeOptional(request.Address);
        profile.BloodType = NormalizeBloodType(request.BloodType);
        profile.Relationship = request.Relationship;

        // Xử lý default profile
        if (profile.IsDefault && !request.IsDefault)
        {
            var nextDefault = await _dbContext.PatientProfiles
                .Where(x =>
                    x.UserId == userId &&
                    x.Id != profileId)
                .OrderBy(x => x.CreatedAt)
                .FirstOrDefaultAsync();

            if (nextDefault is null)
            {
                // Profile duy nhất -> bắt buộc giữ default
                profile.IsDefault = true;
            }
            else
            {
                // Chuyển default sang profile khác
                nextDefault.IsDefault = true;
                nextDefault.UpdatedAt = DateTime.UtcNow;

                profile.IsDefault = false;
            }
        }
        else
        {
            profile.IsDefault = request.IsDefault;
        }

        profile.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(profile); 
    }

    public async Task<bool> DeleteAsync(
        Guid userId,
        Guid profileId)
    {
        var profile = await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(x =>
                x.Id == profileId &&
                x.UserId == userId);

        if (profile is null)
        {
            return false;
        }

        var wasDefault = profile.IsDefault;

        _dbContext.PatientProfiles.Remove(profile);

        await _dbContext.SaveChangesAsync();

        if (wasDefault)
        {
            var nextProfile =
                await _dbContext.PatientProfiles
                    .Where(x => x.UserId == userId)
                    .OrderBy(x => x.CreatedAt)
                    .FirstOrDefaultAsync();

            if (nextProfile is not null)
            {
                nextProfile.IsDefault = true;
                nextProfile.UpdatedAt = DateTime.UtcNow;

                await _dbContext.SaveChangesAsync();
            }
        }

        return true;
    }

    private async Task ClearDefaultProfileAsync(
        Guid userId,
        Guid? exceptProfileId = null)
    {
        var query = _dbContext.PatientProfiles
            .Where(x =>
                x.UserId == userId &&
                x.IsDefault);

        if (exceptProfileId.HasValue)
        {
            query = query.Where(
                x => x.Id != exceptProfileId.Value);
        }

        var defaults = await query.ToListAsync();

        foreach (var profile in defaults)
        {
            profile.IsDefault = false;
            profile.UpdatedAt = DateTime.UtcNow;
        }
    }

    private static void ValidateRequest(
        DateOnly dateOfBirth,
        string gender,
        string? bloodType)
    {
        var today =
            DateOnly.FromDateTime(DateTime.UtcNow);

        if (dateOfBirth > today)
        {
            throw new InvalidOperationException(
                "Date of birth cannot be in the future.");
        }

        var validGenders = new[]
        {
            "Male",
            "Female",
            "Other"
        };

        if (!validGenders.Contains(
                gender.Trim(),
                StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Gender must be Male, Female or Other.");
        }

        if (string.IsNullOrWhiteSpace(bloodType))
        {
            return;
        }

        var validBloodTypes = new[]
        {
            "A+",
            "A-",
            "B+",
            "B-",
            "AB+",
            "AB-",
            "O+",
            "O-"
        };

        if (!validBloodTypes.Contains(
                bloodType.Trim(),
                StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Invalid blood type.");
        }
    }

    private static string NormalizeGender(string gender)
    {
        return gender.Trim().ToLowerInvariant() switch
        {
            "male" => "Male",
            "female" => "Female",
            "other" => "Other",

            _ => gender.Trim()
        };
    }

    private static string? NormalizeOptional(
        string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim();
    }

    private static string? NormalizeBloodType(
        string? bloodType)
    {
        return string.IsNullOrWhiteSpace(bloodType)
            ? null
            : bloodType
                .Trim()
                .ToUpperInvariant();
    }

    private static PatientProfileResponse MapToResponse(
        PatientProfile profile)
    {
        return new PatientProfileResponse
        {
            Id = profile.Id,
            FullName = profile.FullName,
            DateOfBirth = profile.DateOfBirth,
            Gender = profile.Gender,
            Phone = profile.Phone,
            Address = profile.Address,
            BloodType = profile.BloodType,
            Relationship =
                profile.Relationship.ToString(),
            IsDefault = profile.IsDefault,
            CreatedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        };
    }
}