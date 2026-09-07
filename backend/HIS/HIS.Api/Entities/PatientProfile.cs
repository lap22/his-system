using HIS.Api.Enums;

namespace HIS.Api.Entities;

public class PatientProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public string FullName { get; set; } = null!;

    public DateOnly DateOfBirth { get; set; }

    public string Gender { get; set; } = null!;

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? BloodType { get; set; }

    public string? IdentityNumber { get; set; }

    public string? HealthInsuranceNumber { get; set; }

    public RelationshipType Relationship { get; set; }

    public bool IsDefault { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public User User { get; set; } = null!;

    public ICollection<Appointment> Appointments { get; set; }
        = new List<Appointment>();

    public ICollection<MedicalRecord> MedicalRecords { get; set; }
        = new List<MedicalRecord>();
}