namespace HIS.Api.DTOs.PatientProfiles;

public class PatientProfileResponse
{
    public Guid Id { get; set; }

    public string FullName { get; set; } = null!;

    public DateOnly DateOfBirth { get; set; }

    public string Gender { get; set; } = null!;

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? BloodType { get; set; }

    public string Relationship { get; set; } = null!;

    public bool IsDefault { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}