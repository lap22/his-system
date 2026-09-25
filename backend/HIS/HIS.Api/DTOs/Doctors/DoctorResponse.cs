namespace HIS.Api.DTOs.Doctors;

public class DoctorResponse
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string Email { get; set; } = null!;

    public Guid DepartmentId { get; set; }

    public string DepartmentName { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public string? Phone { get; set; }

    public string Specialization { get; set; } = null!;

    public string LicenseNumber { get; set; } = null!;

    public int YearsOfExperience { get; set; }

    public string? Biography { get; set; }

    public string? AvatarUrl { get; set; }

    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}