using HIS.Api.Data;
using HIS.Api.DTOs.Doctors;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services.Doctors;

public class DoctorService : IDoctorService
{
    private readonly AppDbContext _dbContext;

    public DoctorService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<DoctorResponse>> GetAllAsync(
        Guid? departmentId = null,
        bool? isActive = null)
    {
        var query = _dbContext.Doctors
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Department)
            .AsQueryable();

        if (departmentId.HasValue)
        {
            query = query.Where(
                x => x.DepartmentId == departmentId.Value);
        }

        if (isActive.HasValue)
        {
            query = query.Where(
                x => x.IsActive == isActive.Value);
        }

        var doctors = await query
            .OrderBy(x => x.FullName)
            .ToListAsync();

        return doctors
            .Select(MapToResponse)
            .ToList();
    }

    public async Task<DoctorResponse?> GetByIdAsync(Guid id)
    {
        var doctor = await _dbContext.Doctors
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == id);

        return doctor is null
            ? null
            : MapToResponse(doctor);
    }

    public async Task<DoctorResponse> CreateAsync(
        CreateDoctorRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var licenseNumber = request.LicenseNumber.Trim();

        var emailExists = await _dbContext.Users
            .AnyAsync(x => x.Email == email);

        if (emailExists)
        {
            throw new InvalidOperationException(
                "Email already exists.");
        }

        var licenseExists = await _dbContext.Doctors
            .AnyAsync(x => x.LicenseNumber == licenseNumber);

        if (licenseExists)
        {
            throw new InvalidOperationException(
                "License number already exists.");
        }

        var department = await _dbContext.Departments
            .FirstOrDefaultAsync(x =>
                x.Id == request.DepartmentId);

        if (department is null)
        {
            throw new InvalidOperationException(
                "Department not found.");
        }

        if (!department.IsActive)
        {
            throw new InvalidOperationException(
                "Department is inactive.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,

            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(
                    request.Password),

            Role = UserRole.Doctor,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        var doctor = new Doctor
        {
            Id = Guid.NewGuid(),

            UserId = user.Id,

            DepartmentId = department.Id,

            FullName = request.FullName.Trim(),

            Phone = NormalizeOptional(
                request.Phone),

            Specialization =
                request.Specialization.Trim(),

            LicenseNumber = licenseNumber,

            YearsOfExperience =
                request.YearsOfExperience,

            Biography = NormalizeOptional(
                request.Biography),

            AvatarUrl = NormalizeOptional(
                request.AvatarUrl),

            IsActive = true,

            CreatedAt = DateTime.UtcNow,

            User = user,

            Department = department
        };

        _dbContext.Users.Add(user);
        _dbContext.Doctors.Add(doctor);

        await _dbContext.SaveChangesAsync();

        return MapToResponse(doctor);
    }

    public async Task<DoctorResponse?> UpdateAsync(
        Guid id,
        UpdateDoctorRequest request)
    {
        var doctor = await _dbContext.Doctors
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doctor is null)
        {
            return null;
        }

        var department = await _dbContext.Departments
            .FirstOrDefaultAsync(x =>
                x.Id == request.DepartmentId);

        if (department is null)
        {
            throw new InvalidOperationException(
                "Department not found.");
        }

        if (!department.IsActive)
        {
            throw new InvalidOperationException(
                "Department is inactive.");
        }

        var licenseNumber =
            request.LicenseNumber.Trim();

        var licenseExists =
            await _dbContext.Doctors.AnyAsync(x =>
                x.LicenseNumber == licenseNumber &&
                x.Id != id);

        if (licenseExists)
        {
            throw new InvalidOperationException(
                "License number already exists.");
        }

        doctor.DepartmentId = department.Id;
        doctor.Department = department;

        doctor.FullName =
            request.FullName.Trim();

        doctor.Phone =
            NormalizeOptional(request.Phone);

        doctor.Specialization =
            request.Specialization.Trim();

        doctor.LicenseNumber =
            licenseNumber;

        doctor.YearsOfExperience =
            request.YearsOfExperience;

        doctor.Biography =
            NormalizeOptional(request.Biography);

        doctor.AvatarUrl =
            NormalizeOptional(request.AvatarUrl);

        doctor.UpdatedAt =
            DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(doctor);
    }

    public async Task<DoctorResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDoctorStatusRequest request)
    {
        var doctor = await _dbContext.Doctors
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doctor is null)
        {
            return null;
        }

        doctor.IsActive = request.IsActive;

        // Đồng bộ trạng thái tài khoản
        doctor.User.IsActive = request.IsActive;

        doctor.UpdatedAt = DateTime.UtcNow;
        doctor.User.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(doctor);
    }

    private static string? NormalizeOptional(
        string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim();
    }

    private static DoctorResponse MapToResponse(
        Doctor doctor)
    {
        return new DoctorResponse
        {
            Id = doctor.Id,
            UserId = doctor.UserId,
            Email = doctor.User.Email,

            DepartmentId =
                doctor.DepartmentId,

            DepartmentName =
                doctor.Department.Name,

            FullName = doctor.FullName,
            Phone = doctor.Phone,

            Specialization =
                doctor.Specialization,

            LicenseNumber =
                doctor.LicenseNumber,

            YearsOfExperience =
                doctor.YearsOfExperience,

            Biography = doctor.Biography,
            AvatarUrl = doctor.AvatarUrl,

            IsActive = doctor.IsActive,

            CreatedAt = doctor.CreatedAt,
            UpdatedAt = doctor.UpdatedAt
        };
    }
}